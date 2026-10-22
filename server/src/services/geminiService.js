const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uploadToS3 } = require('./s3Service');
const { logError, logWarn, logInfo } = require('../utils/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Límites de tiempo: API Gateway y Lambda cortan a los 30 s, por lo que se responde antes con un mensaje amable
const TURN_BUDGET_MS = 24000;        // Presupuesto total de un turno (varias llamadas a Gemini + herramientas)
const CALL_TIMEOUT_MS = 15000;       // Timeout máximo por llamada a Gemini
const RETRY_DELAY_MS = 1000;         // Espera antes del único reintento ante 429/503
const RETRY_MIN_REMAINING_MS = 8000; // Solo se reintenta si queda al menos este tiempo de presupuesto

// Mensajes naturales para el usuario: el detalle técnico solo se registra en los logs
const USER_ERROR_MESSAGES = {
  timeout: 'Tardé demasiado en responder. ¿Puedes intentarlo de nuevo?',
  overloaded: 'El asistente está con mucha demanda en este momento. Intenta de nuevo en unos segundos.',
  blocked: 'No pude procesar ese contenido. ¿Puedes reformular tu mensaje o enviar otra imagen?',
  empty: 'No logré armar una respuesta con esa consulta. ¿Puedes reformularla o darme más detalle?',
  generic: 'Tuve un inconveniente al procesar tu solicitud. Intenta de nuevo en un momento.'
};

const WRITE_TOOLS = ['update_reminder', 'add_followup_note', 'create_reminder'];

// Máximo de rondas de herramientas por turno; si el modelo sigue pidiendo herramientas, se le fuerza a responder con lo obtenido
const MAX_TOOL_ROUNDS = 3;
const FORCE_ANSWER_PROMPT = 'Con la información que ya obtuviste, responde ahora al usuario de forma clara y natural. No llames más herramientas.';

// Los días se calculan siempre en hora de Quito (Ecuador no usa horario de verano: UTC-5 todo el año),
// sin depender de la zona horaria del servidor
const QUITO_UTC_OFFSET_HOURS = 5;

/** Fecha (YYYY-MM-DD) de un instante en hora de Quito */
const quitoDateString = (date) => new Date(date.getTime() - QUITO_UTC_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10);

/** Rango [inicio, fin] de un día (YYYY-MM-DD) en hora de Quito; null si la fecha no es válida */
const quitoDayRange = (dateString) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return null;
  const start = new Date(`${dateString}T00:00:00.000-05:00`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000 - 1) };
};

/** Parámetros de una llamada a herramienta aptos para logs (sin nombres, teléfonos ni textos de clientes) */
const describeToolCall = ({ tool, args = {} }) => ({
  tool,
  filter: args.filter,
  dateString: args.dateString,
  allAdvisors: args.allAdvisors,
  hasQuery: Boolean(args.query || args.clientName)
});

/**
 * Clasifica un error del SDK de Gemini en una categoría y si vale la pena reintentar.
 * 429 (cuota) y 503 (sobrecarga) son reintentables; clave inválida, contenido bloqueado, etc. no.
 */
const classifyGeminiError = (error) => {
  const status = error?.status;
  // Las clases de error del SDK no redefinen `name` (queda "Error"), por eso se compara el nombre del constructor
  const errorClass = error?.constructor?.name;
  if (error?.name === 'AbortError' || errorClass === 'GoogleGenerativeAIAbortError' || error?.name === 'TurnBudgetExceededError') {
    return { kind: 'timeout', retryable: false };
  }
  if (status === 429 || status === 503) {
    return { kind: 'overloaded', retryable: true };
  }
  if (status >= 500 && status < 600) {
    return { kind: 'overloaded', retryable: false };
  }
  if (error?.response?.promptFeedback?.blockReason || /SAFETY|blocked/i.test(error?.message || '')) {
    return { kind: 'blocked', retryable: false };
  }
  if (error?.name === 'EmptyReplyError') {
    return { kind: 'empty', retryable: false };
  }
  return { kind: 'generic', retryable: false };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Llama a Gemini con timeout por llamada, respetando el presupuesto total del turno (deadline)
 * y con un único reintento ante 429/503 si queda tiempo suficiente.
 */
const callGemini = async (model, contents, deadline, logContext, extraRequest = {}) => {
  let retried = false;

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) {
      const err = new Error('Presupuesto de tiempo del turno agotado');
      err.name = 'TurnBudgetExceededError';
      throw err;
    }

    try {
      return await model.generateContent({ contents, ...extraRequest }, { timeout: Math.min(CALL_TIMEOUT_MS, remaining) });
    } catch (error) {
      const { kind, retryable } = classifyGeminiError(error);
      const canRetry = retryable && !retried && (deadline - Date.now()) > RETRY_MIN_REMAINING_MS;
      if (!canRetry) {
        throw error;
      }
      retried = true;
      logError('gemini_retry', error, { ...logContext, kind });
      await sleep(RETRY_DELAY_MS);
    }
  }
};

let genAI = null;
if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '') {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ GoogleGenerativeAI Client inicializado con GEMINI_API_KEY.');
  } catch (err) {
    console.warn('⚠️ Error instanciando GoogleGenerativeAI:', err.message);
  }
}

// Zona Horaria y Sistema
const SYSTEM_PROMPT = `
Eres el Asistente Comercial Inteligente de MVEVIP para la gestión ágil de leads y recordatorios de Chatrace y ventas.
Tu misión es asistir al asesor en todo: consultar compromisos, reprogramar citas, registrar notas de seguimiento, buscar clientes, mostrar fotos/comprobantes adjuntos y crear nuevos recordatorios.

ZONA HORARIA OBLIGATORIA: America/Guayaquil (Quito, Ecuador UTC-5).
Hora y fecha de referencia actual: {CURRENT_DATE_QUITO}.

INFORMACIÓN DEL USUARIO ACTUAL CON EL QUE ESTÁS HABLANDO:
- Nombre: {USER_NAME}
- Rol: {USER_ROLE}
- ID de usuario: {USER_ID}

BASE DE DATOS EXCLUSIVA ('mvevip_leads'):
- Gestionas EXCLUSIVAMENTE la base de datos 'mvevip_leads'.
- Está TERMINANTEMENTE PROHIBIDO buscar, consultar, enumerar, ejecutar consultas o referenciar cualquier otra base de datos o esquema del servidor MySQL. Solo debes interactuar con los datos y tablas de leads y recordatorios de 'mvevip_leads'.

PROHIBICIÓN ESTRICTA DE ELIMINACIÓN DE DATOS (PARA TODOS LOS USUARIOS):
- ESTÁ PROHIBIDO PARA TODOS LOS USUARIOS (INCLUIDOS ADMINISTRADORES) ELIMINAR O BORRAR REGISTROS DE LA BASE DE DATOS.
- NO EXISTE NINGUNA FUNCIÓN PARA BORRAR O ELIMINAR ('DELETE', 'DROP', 'TRUNCATE').
- Si un usuario te solicita "eliminar", "borrar" o "quitar" un lead, cliente, compromiso o usuario:
  * Explícale con cortesía y firmeza que por estrictas políticas de auditoría y seguridad empresarial, NO ESTÁ PERMITIDO borrar datos de la base de datos.
  * Ofrécele en su lugar:
    1) Marcar el compromiso como descartado / dado de baja ('DISMISSED') o completado ('COMPLETED').
    2) Deshabilitar o cambiar el estado mediante update_reminder.
    3) Añadir una nota de seguimiento aclarando el motivo por el cual no se dará continuidad al lead.

CONTROL DE ACCESO Y PRIVACIDAD DE DATOS SEGÚN EL ROL:
1. SI EL USUARIO ACTUAL ES ASESOR (Rol: ASESOR):
   - Solo puede consultar y gestionar sus propios clientes y compromisos (asignados a {USER_NAME}).
   - NUNCA puede consultar ni recibir información de otros asesores del equipo, incluso si lo solicita directamente.

2. SI EL USUARIO ACTUAL ES ADMINISTRADOR (Rol: ADMIN):
   - POR DEFECTO, TODAS LAS CONSULTAS DEBEN PRIORIZAR Y MOSTRAR ÚNICAMENTE LOS COMPROMISOS Y CLIENTES DE ESTE PROPIO ADMINISTRADOR ({USER_NAME}). Si pregunta "¿cuáles son mis pendientes?", "¿qué tengo hoy?", "¿qué me falta?", responde SOLO con los suyos.
   - ÚNICAMENTE SI el administrador pide EXPLÍCITAMENTE información de todos los asesores (ej: "muéstrame los pendientes de todo el equipo", "de todos los asesores", "reporte global") o de un asesor específico (ej: "qué tiene Juan", "busca los de Pedro"), entonces pasa allAdvisors: true o advisorName a las herramientas.

INSTRUCCIONES DE FORMATO Y ESTILO:
- COMUNICACIÓN 100% NATURAL: Habla como un asistente comercial humano, cercano, ejecutivo y resolutivo.
- NUNCA menciones términos técnicos como "base de datos", "BD", "tabla", "registros", "query" o "servidor".
- En lugar de decir "He actualizado el compromiso en la base de datos", di naturalmente "¡Listo! He marcado el compromiso de Carlitos como completado" o "He reprogramado la cita de Carlos para mañana".
- Cuando entregues listados de clientes o pendientes, UTILIZA TABLAS MARKDOWN claras (Columnas: | Cliente | Teléfono | Compromiso | Fecha / Hora | Estado |).
- Si encontraste una imagen del cliente (mediaUrl), confírmalo y referencia la foto.
- Confirma de manera clara y natural cualquier modificación o nota registrada.
`;

// Declaración de Herramientas (Function Declarations) para Gemini
const toolsDeclarations = [
  {
    functionDeclarations: [
      {
        name: "get_my_reminders",
        description: "Consulta compromisos o pendientes en la base de datos 'mvevip_leads'. Por defecto devuelve ÚNICAMENTE los del usuario actual. Solo un ADMIN puede pedir ver todos los asesores o un asesor específico.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter: {
              type: "STRING",
              enum: ["today", "pending_all", "completed", "all"],
              description: "Filtro de búsqueda: 'today' (del día), 'pending_all' (todos los pendientes por realizar), 'completed' (los terminados)."
            },
            dateString: {
              type: "STRING",
              description: "Fecha específica en formato YYYY-MM-DD (opcional)"
            },
            allAdvisors: {
              type: "BOOLEAN",
              description: "SOLO PARA ADMIN: true únicamente si el administrador solicita explícitamente ver los de todos los asesores o de todo el equipo. Por defecto false."
            },
            advisorName: {
              type: "STRING",
              description: "SOLO PARA ADMIN: Nombre o email del asesor específico si el administrador pide consultar a alguien en particular."
            }
          }
        }
      },
      {
        name: "search_leads",
        description: "Busca leads y recordatorios por nombre de cliente, teléfono o palabras clave en 'mvevip_leads'. Por defecto solo busca en los del usuario actual.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Nombre del cliente, teléfono o descripción a buscar"
            },
            allAdvisors: {
              type: "BOOLEAN",
              description: "SOLO PARA ADMIN: true si el administrador solicita explícitamente buscar en los leads de todo el equipo."
            },
            advisorName: {
              type: "STRING",
              description: "SOLO PARA ADMIN: Nombre del asesor específico a buscar."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_lead_details",
        description: "Obtiene los detalles completos, notas previas y la imagen o captura adjunta de un cliente en 'mvevip_leads'. Por defecto busca en los del usuario actual.",
        parameters: {
          type: "OBJECT",
          properties: {
            clientName: {
              type: "STRING",
              description: "Nombre del cliente a consultar"
            },
            reminderId: {
              type: "STRING",
              description: "ID del recordatorio (opcional si se da el nombre)"
            },
            allAdvisors: {
              type: "BOOLEAN",
              description: "SOLO PARA ADMIN: true si el admin busca explícitamente en todo el equipo."
            }
          }
        }
      },
      {
        name: "update_reminder",
        description: "Actualiza un compromiso: reprogramar fecha/hora, cambiar estado ('PENDING', 'COMPLETED', 'DISMISSED' para dar de baja/descartar) o agregar nota. NO PERMITE ELIMINAR.",
        parameters: {
          type: "OBJECT",
          properties: {
            clientName: {
              type: "STRING",
              description: "Nombre del cliente cuyo compromiso se va a modificar"
            },
            reminderId: {
              type: "STRING",
              description: "ID del recordatorio si se conoce"
            },
            newScheduledAt: {
              type: "STRING",
              description: "Nueva fecha y hora en formato ISO 8601 (ej: 2026-10-09T15:00:00.000Z)"
            },
            status: {
              type: "STRING",
              enum: ["PENDING", "COMPLETED", "DISMISSED"],
              description: "Nuevo estado del compromiso: PENDING, COMPLETED o DISMISSED (para descartar o deshabilitar). ELIMINACIÓN NO PERMITIDA."
            },
            note: {
              type: "STRING",
              description: "Nota explicativa del cambio"
            },
            allAdvisors: {
              type: "BOOLEAN",
              description: "SOLO PARA ADMIN: true si el admin modifica un lead asignado a otro asesor explícitamente."
            }
          },
          required: ["clientName"]
        }
      },
      {
        name: "add_followup_note",
        description: "Agrega una nota de seguimiento a un lead en 'mvevip_leads' (ej: 'quiere otra cotización', 'interesado en plan premium').",
        parameters: {
          type: "OBJECT",
          properties: {
            clientName: {
              type: "STRING",
              description: "Nombre del cliente"
            },
            note: {
              type: "STRING",
              description: "Detalle de la nota de seguimiento"
            },
            allAdvisors: {
              type: "BOOLEAN",
              description: "SOLO PARA ADMIN: true si el admin agrega nota a un lead de otro asesor explícitamente."
            }
          },
          required: ["clientName", "note"]
        }
      },
      {
        name: "create_reminder",
        description: "Registra un nuevo compromiso o lead en la base de datos 'mvevip_leads' asignado al usuario actual o a quien indique el admin.",
        parameters: {
          type: "OBJECT",
          properties: {
            clientName: {
              type: "STRING",
              description: "Nombre o empresa del cliente"
            },
            clientPhone: {
              type: "STRING",
              description: "Teléfono del cliente (opcional)"
            },
            title: {
              type: "STRING",
              description: "Título breve del recordatorio (máx 60 caracteres)"
            },
            description: {
              type: "STRING",
              description: "Detalle de lo que se acordó o requiere"
            },
            scheduledAt: {
              type: "STRING",
              description: "Fecha y hora pactada en formato ISO 8601"
            },
            priority: {
              type: "STRING",
              enum: ["LOW", "MEDIUM", "HIGH", "URGENT"]
            },
            assignedToAdvisorName: {
              type: "STRING",
              description: "SOLO PARA ADMIN: nombre del asesor a quien asignar el compromiso (opcional, por defecto al usuario actual)"
            }
          },
          required: ["clientName", "title", "scheduledAt"]
        }
      }
    ]
  }
];

/**
 * Ejecutor de herramientas en Base de Datos (Prisma)
 * RESTRICCIÓN: Opera únicamente sobre mvevip_leads.
 * SEGURIDAD: Prohibición total de DELETE. Por defecto solo filtra registros del usuario actual.
 */
async function executeTool(toolName, args, user, referenceDate) {
  try {
    const isUserAdmin = user.role === 'ADMIN';

    // Helper centralizado para resolver el filtro de asignación
    const resolveAssignedFilter = async () => {
      if (!isUserAdmin) {
        // Asesor: estrictamente solo el usuario actual
        return { assignedId: user.id };
      }
      // Admin: por defecto SOLO el usuario actual, salvo petición explícita
      if (args.allAdvisors === true) {
        return {}; // ver todos los asesores
      }
      if (args.advisorName) {
        const adv = await prisma.user.findFirst({
          where: { name: { contains: args.advisorName.trim() } }
        });
        if (adv) return { assignedId: adv.id };
      }
      // Por defecto para el admin: SOLO SUS PROPIOS RECORDATORIOS
      return { assignedId: user.id };
    };

    if (toolName === 'get_my_reminders') {
      const filter = args.filter || 'today';
      const assignedFilter = await resolveAssignedFilter();
      let where = { ...assignedFilter };

      const todayRange = quitoDayRange(quitoDateString(referenceDate));

      if (filter === 'today') {
        where.scheduledAt = { gte: todayRange.start, lte: todayRange.end };
      } else if (filter === 'pending_all') {
        where.status = 'PENDING';
      } else if (filter === 'completed') {
        where.status = 'COMPLETED';
      }

      const targetRange = quitoDayRange(args.dateString);
      if (targetRange) {
        where.scheduledAt = { gte: targetRange.start, lte: targetRange.end };
      }

      const reminders = await prisma.reminder.findMany({
        where,
        include: {
          assigned: { select: { id: true, name: true } }
        },
        orderBy: { scheduledAt: 'asc' },
        take: 30
      });

      return {
        count: reminders.length,
        reminders: reminders.map(r => ({
          id: r.id,
          clientName: r.clientName,
          clientPhone: r.clientPhone || 'No registrado',
          title: r.title,
          description: r.description || '',
          scheduledAt: r.scheduledAt.toISOString(),
          status: r.status,
          priority: r.priority,
          assignedTo: r.assigned?.name || 'Sin asignar',
          hasMedia: Boolean(r.mediaUrl)
        }))
      };
    }

    if (toolName === 'search_leads') {
      const q = args.query.trim();
      const assignedFilter = await resolveAssignedFilter();
      const where = {
        ...assignedFilter,
        OR: [
          { clientName: { contains: q } },
          { clientPhone: { contains: q } },
          { title: { contains: q } },
          { description: { contains: q } }
        ]
      };

      const results = await prisma.reminder.findMany({
        where,
        include: {
          assigned: { select: { name: true } },
          followups: { orderBy: { createdAt: 'desc' }, take: 2 }
        },
        orderBy: { scheduledAt: 'desc' },
        take: 10
      });

      return {
        foundCount: results.length,
        leads: results.map(r => ({
          id: r.id,
          clientName: r.clientName,
          clientPhone: r.clientPhone,
          title: r.title,
          scheduledAt: r.scheduledAt.toISOString(),
          status: r.status,
          mediaUrl: r.mediaUrl || null,
          recentNotes: r.followups.map(f => f.note)
        }))
      };
    }

    if (toolName === 'get_lead_details') {
      const assignedFilter = await resolveAssignedFilter();
      let where = { ...assignedFilter };

      if (args.reminderId) {
        where.id = args.reminderId;
      } else if (args.clientName) {
        where.clientName = { contains: args.clientName.trim() };
      }

      const lead = await prisma.reminder.findFirst({
        where,
        include: {
          assigned: { select: { name: true } },
          followups: { orderBy: { createdAt: 'desc' } }
        }
      });

      if (!lead) {
        return { 
          success: false, 
          message: `No se encontró ningún lead para '${args.clientName || args.reminderId}' en tus registros. ${isUserAdmin && !args.allAdvisors ? '(Si deseas buscar en todos los asesores, pídelo explícitamente).' : ''}` 
        };
      }

      return {
        success: true,
        lead: {
          id: lead.id,
          clientName: lead.clientName,
          clientPhone: lead.clientPhone,
          title: lead.title,
          description: lead.description,
          scheduledAt: lead.scheduledAt.toISOString(),
          status: lead.status,
          priority: lead.priority,
          mediaUrl: lead.mediaUrl || null,
          assignedTo: lead.assigned?.name,
          followups: lead.followups.map(f => ({ note: f.note, date: f.createdAt.toISOString() }))
        }
      };
    }

    if (toolName === 'update_reminder') {
      const q = args.clientName.trim();
      const assignedFilter = await resolveAssignedFilter();
      const where = {
        ...assignedFilter,
        ...(args.reminderId ? { id: args.reminderId } : { clientName: { contains: q } })
      };

      const existing = await prisma.reminder.findFirst({
        where,
        orderBy: { scheduledAt: 'desc' }
      });

      if (!existing) {
        return { success: false, message: `No se encontró ningún compromiso para '${args.clientName}'.` };
      }

      const dataToUpdate = {};
      if (args.newScheduledAt) dataToUpdate.scheduledAt = new Date(args.newScheduledAt);
      if (args.status && ['PENDING', 'COMPLETED', 'DISMISSED'].includes(args.status)) {
        dataToUpdate.status = args.status;
      }

      const updated = await prisma.reminder.update({
        where: { id: existing.id },
        data: dataToUpdate
      });

      if (args.note || args.status === 'DISMISSED') {
        const noteText = args.note || (args.status === 'DISMISSED' ? 'Compromiso dado de baja / descartado.' : 'Actualización de estado');
        await prisma.reminderFollowup.create({
          data: {
            reminderId: existing.id,
            userId: user.id,
            note: noteText,
            actionType: args.newScheduledAt ? 'RESCHEDULE' : (args.status ? 'STATUS_CHANGE' : 'NOTE')
          }
        });
      }

      return {
        success: true,
        message: `Compromiso de ${updated.clientName} actualizado exitosamente (Estado: ${updated.status}).`,
        reminder: {
          id: updated.id,
          clientName: updated.clientName,
          scheduledAt: updated.scheduledAt.toISOString(),
          status: updated.status
        }
      };
    }

    if (toolName === 'add_followup_note') {
      const q = args.clientName.trim();
      const assignedFilter = await resolveAssignedFilter();
      const where = {
        ...assignedFilter,
        clientName: { contains: q }
      };

      const lead = await prisma.reminder.findFirst({
        where,
        orderBy: { scheduledAt: 'desc' }
      });

      if (!lead) {
        return { success: false, message: `No se encontró el cliente '${args.clientName}'.` };
      }

      const followup = await prisma.reminderFollowup.create({
        data: {
          reminderId: lead.id,
          userId: user.id,
          note: args.note,
          actionType: 'NOTE'
        }
      });

      return {
        success: true,
        message: `Nota guardada para ${lead.clientName}: "${args.note}"`,
        followupId: followup.id
      };
    }

    if (toolName === 'create_reminder') {
      let assignedUserId = user.id;
      if (isUserAdmin && args.assignedToAdvisorName) {
        const adv = await prisma.user.findFirst({
          where: { name: { contains: args.assignedToAdvisorName.trim() } }
        });
        if (adv) assignedUserId = adv.id;
      }

      const created = await prisma.reminder.create({
        data: {
          creatorId: user.id,
          assignedId: assignedUserId,
          clientName: args.clientName,
          clientPhone: args.clientPhone || null,
          title: args.title,
          description: args.description || '',
          scheduledAt: new Date(args.scheduledAt),
          priority: args.priority || 'MEDIUM',
          status: 'PENDING',
          sourceType: 'BOT_TEXT'
        }
      });

      return {
        success: true,
        message: `Compromiso para ${created.clientName} creado exitosamente para el ${created.scheduledAt.toISOString()}.`,
        reminderId: created.id
      };
    }

    return { error: `Herramienta ${toolName} no reconocida.` };
  } catch (error) {
    logError(`tool:${toolName}`, error, { userId: user?.id });
    return { error: 'No se pudo completar la operación solicitada.' };
  }
}

/**
 * Procesa un turno del Asistente Comercial IA con Tool Calling
 */
const processAssistantTurn = async (user, history = [], newMessage = '', fileBuffer = null, mimeType = null, referenceDate = new Date()) => {
  if (!genAI) {
    logError('gemini_not_configured', new Error('GEMINI_API_KEY no configurada o cliente no inicializado'), { userId: user?.id });
    return {
      reply: USER_ERROR_MESSAGES.generic,
      actions: [],
      isError: true
    };
  }

  // Usar modelo gemini-3.8-flash con soporte completo multimodal y tool calling
  const modelName = 'gemini-3.8-flash';

  const startedAt = Date.now();
  const deadline = startedAt + TURN_BUDGET_MS;
  const logContext = { userId: user?.id, model: modelName };
  const executedActions = [];
  let geminiCalls = 0;
  let retriedWithoutHistory = false;
  const recentHistoryCount = Array.isArray(history) ? Math.min(history.length, 10) : 0;

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: toolsDeclarations
    });

    const formattedDate = referenceDate.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
    const systemInstruction = SYSTEM_PROMPT
      .replace('{CURRENT_DATE_QUITO}', `${formattedDate} (${referenceDate.toISOString()})`)
      .replace('{USER_NAME}', user?.name || 'Usuario')
      .replace('{USER_ROLE}', user?.role || 'ASESOR')
      .replace('{USER_ID}', user?.id || '');

    // Mensaje actual del usuario (con su archivo adjunto, si lo hay)
    const currentParts = [];
    if (fileBuffer && mimeType) {
      currentParts.push({
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType
        }
      });
      if (mimeType.startsWith('image/')) {
        currentParts.push({ text: `[Imagen/Captura adjunta]: ${newMessage || 'Analiza esta captura y gestiona el lead correspondiente.'}` });
      } else if (mimeType.startsWith('audio/')) {
        currentParts.push({ text: `[Nota de voz adjunta]: ${newMessage || 'Escucha el audio y ejecuta la acción requerida sobre el lead.'}` });
      }
    } else {
      currentParts.push({ text: newMessage || 'Hola' });
    }

    // Contexto enviado al modelo: instrucciones del sistema, historial reciente (últimos 10 mensajes) y el mensaje actual
    const buildContents = (historyMessages) => {
      const built = [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Entendido. Soy tu asistente comercial. Estoy listo para ayudarte a gestionar tus citas, clientes y compromisos de forma ágil y natural.' }] }
      ];
      for (const msg of (historyMessages || []).slice(-10)) {
        built.push({
          role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.content || msg.text || '' }]
        });
      }
      built.push({ role: 'user', parts: currentParts });
      return built;
    };

    let contents = buildContents(history);

    // 1. Primera llamada a Gemini (puede retornar texto o llamada a herramienta)
    geminiCalls++;
    let response;
    let functionCalls;
    try {
      response = await callGemini(model, contents, deadline, logContext);
      functionCalls = response.response.functionCalls();
    } catch (firstCallError) {
      // El filtro de contenido de Gemini evalúa todo el contexto y puede dar falsos positivos por mensajes antiguos del historial.
      // Si bloquea el primer llamado (aún no se ejecutó ninguna herramienta, nada se duplica), se reintenta una vez sin historial.
      const { kind } = classifyGeminiError(firstCallError);
      if (kind !== 'blocked' || recentHistoryCount === 0 || executedActions.length > 0) {
        throw firstCallError;
      }
      logWarn('gemini_blocked_retry', {
        ...logContext,
        blockReason: firstCallError?.response?.promptFeedback?.blockReason,
        historyMessages: recentHistoryCount,
        hasFile: Boolean(fileBuffer),
        fileType: mimeType ? mimeType.split('/')[0] : undefined
      });
      retriedWithoutHistory = true;
      contents = buildContents([]);
      geminiCalls++;
      response = await callGemini(model, contents, deadline, logContext);
      functionCalls = response.response.functionCalls();
    }

    let leadImages = [];

    // 2. Bucle de ejecución de herramientas (soporta hasta 3 llamadas encadenadas)
    let turns = 0;
    while (functionCalls && functionCalls.length > 0 && turns < MAX_TOOL_ROUNDS) {
      turns++;
      contents.push(response.response.candidates[0].content);

      const toolResponseParts = [];

      for (const call of functionCalls) {
        const result = await executeTool(call.name, call.args, user, referenceDate);
        executedActions.push({ tool: call.name, args: call.args, result });

        // Si la herramienta retornó una imagen de lead, capturarla para la vista
        if (result?.lead?.mediaUrl) {
          leadImages.push(result.lead.mediaUrl);
        } else if (result?.leads) {
          result.leads.forEach(l => { if (l.mediaUrl) leadImages.push(l.mediaUrl); });
        }

        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: result,
            ...(call.id ? { id: call.id } : {})
          }
        });
      }

      contents.push({
        role: 'user',
        parts: toolResponseParts
      });

      // Llamar a Gemini nuevamente con los resultados de la base de datos
      geminiCalls++;
      response = await callGemini(model, contents, deadline, logContext);
      functionCalls = response.response.functionCalls();
    }

    let replyText = response.response.text();

    // Sin texto (el modelo agotó las rondas pidiendo más herramientas, o respondió vacío): se le pide una última
    // respuesta sin herramientas con lo ya obtenido. Nunca se entrega ni se guarda una respuesta vacía.
    let forcedAnswer = false;
    if (!replyText || !replyText.trim()) {
      forcedAnswer = true;
      geminiCalls++;
      const forced = await callGemini(
        model,
        [...contents, { role: 'user', parts: [{ text: FORCE_ANSWER_PROMPT }] }],
        deadline,
        logContext,
        { toolConfig: { functionCallingConfig: { mode: 'NONE' } } }
      );
      replyText = forced.response.text();
      if (!replyText || !replyText.trim()) {
        const emptyError = new Error('El modelo no devolvió texto de respuesta');
        emptyError.name = 'EmptyReplyError';
        throw emptyError;
      }
    }

    logInfo('assistant_turn', {
      ...logContext,
      durationMs: Date.now() - startedAt,
      geminiCalls,
      forcedAnswer,
      retriedWithoutHistory,
      tools: executedActions.map((a) => a.tool),
      calls: executedActions.map(describeToolCall),
      hasFile: Boolean(fileBuffer)
    });

    return {
      reply: replyText,
      actions: executedActions,
      images: leadImages.filter(Boolean)
    };
  } catch (error) {
    const { kind } = classifyGeminiError(error);
    logError('assistant_turn', error, {
      ...logContext,
      kind,
      blockReason: error?.response?.promptFeedback?.blockReason,
      hasFile: Boolean(fileBuffer),
      fileType: mimeType ? mimeType.split('/')[0] : undefined,
      historyMessages: retriedWithoutHistory ? 0 : recentHistoryCount,
      retriedWithoutHistory,
      durationMs: Date.now() - startedAt,
      geminiCalls,
      tools: executedActions.map((a) => a.tool),
      calls: executedActions.map(describeToolCall)
    });

    // Si ya se ejecutó alguna escritura exitosa antes del fallo, no se pierde: se avisa y se devuelven las acciones para refrescar la agenda
    const wroteData = executedActions.some((a) => WRITE_TOOLS.includes(a.tool) && a.result?.success);
    const reply = wroteData
      ? 'Registré tu solicitud, pero tardé en confirmártelo. Revisa tu agenda para verificarla.'
      : USER_ERROR_MESSAGES[kind] || USER_ERROR_MESSAGES.generic;

    return {
      reply,
      actions: executedActions,
      isError: true
    };
  }
};

module.exports = {
  processAssistantTurn
};
