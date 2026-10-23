const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const { sendBroadcastPush, sendPushToUser } = require('../services/webPushService');
const { normalizeMediaUrl } = require('../services/s3Service');
const { validatePassword, generateTempPassword } = require('../utils/passwords');
const { bumpTokenVersion } = require('../utils/sessionVersion');
const { logInfo, logWarn, logError } = require('../utils/logger');
const chatraceService = require('../services/chatraceService');
const chatraceSettings = require('../services/chatraceSettings');

const VALID_ROLES = ['ADMIN', 'ASESOR'];
const ROLE_LABELS = { ADMIN: 'Administrador', ASESOR: 'Asesor Comercial' };

/**
 * Listar todos los usuarios / asesores (con soporte para filtro active/inactive)
 */
const getUsers = async (req, res) => {
  try {
    const { status } = req.query; // 'active', 'inactive' o undefined
    const where = {};

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        _count: {
          select: { assignedReminders: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Etiqueta de Chatrace de cada usuario. Si la tabla de configuración aún no existe, la lista sale igual, sin etiquetas.
    let advisorTags = {};
    try {
      advisorTags = await chatraceSettings.getAdvisorTags(users.map((u) => u.id));
    } catch (err) {
      logWarn('chatrace_config', { kind: 'settings_unavailable', errorName: err?.name, code: err?.code });
    }
    return res.json(users.map((u) => ({ ...u, chatraceTag: advisorTags[u.id] || null })));
  } catch (error) {
    console.error('Error listando usuarios:', error);
    return res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

/**
 * Crear un nuevo usuario (asesor o admin) con contraseña temporal y mustChangePassword = true
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'ASESOR', phone, avatarUrl } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo electrónico y contraseña inicial son obligatorios' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'El tipo de usuario debe ser ADMIN o ASESOR' });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (existing) {
      return res.status(400).json({ error: 'El email ya se encuentra registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        phone,
        avatarUrl: avatarUrl ? normalizeMediaUrl(avatarUrl) : null,
        isActive: true,
        mustChangePassword: true, // Nuevo usuario debe cambiar clave
        isFirstLogin: true // Nuevo usuario debe registrar o omitir foto
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        mustChangePassword: true,
        isFirstLogin: true
      }
    });

    return res.status(201).json({
      message: 'Usuario creado exitosamente',
      user,
      initialPassword: password
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
};

/**
 * Cambiar el tipo de usuario (ADMIN <-> ASESOR).
 * Protecciones: no se puede cambiar el propio rol y no se puede degradar al último administrador activo.
 * El servidor decide los permisos por el rol guardado en la base de datos en cada petición, por lo que el cambio
 * aplica de inmediato. Además se cierran las sesiones del usuario (tokenVersion) para que su pantalla muestre los
 * permisos nuevos al volver a entrar, y se le avisa con una notificación.
 */
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'El tipo de usuario debe ser ADMIN o ASESOR' });
    }

    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio tipo de usuario' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetUser.role === role) {
      return res.json({
        message: `El usuario ya tiene el perfil de ${ROLE_LABELS[role]}`,
        user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role, isActive: targetUser.isActive },
        changed: false
      });
    }

    if (targetUser.role === 'ADMIN' && targetUser.isActive) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: id } }
      });
      if (otherActiveAdmins === 0) {
        return res.status(400).json({ error: 'No se puede degradar al último administrador activo' });
      }
    }

    const previousRole = targetUser.role;
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    // Cierra las sesiones abiertas del usuario y le avisa del cambio
    const sessionsClosed = await bumpTokenVersion(id);
    await sendPushToUser(id, {
      title: 'Tu perfil fue actualizado',
      body: `Ahora tienes el perfil de ${ROLE_LABELS[role]}. Vuelve a iniciar sesión para ver tus nuevos permisos.`,
      url: '/'
    });

    logInfo('role_changed', { actorId: req.user.id, targetId: id, from: previousRole, to: role, sessionsClosed });

    return res.json({
      message: `${updated.name} ahora es ${ROLE_LABELS[role]}`,
      user: updated,
      changed: true,
      sessionsClosed
    });
  } catch (error) {
    logError('admin_update_role', error, { actorId: req.user?.id, targetId: req.params?.id });
    return res.status(500).json({ error: 'Error al cambiar el tipo de usuario' });
  }
};

/**
 * Habilitar o Deshabilitar usuario (Toggle Active/Inactive)
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes deshabilitar tu propia cuenta' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !targetUser.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    return res.json({
      message: updated.isActive ? 'Usuario activado exitosamente' : 'Usuario deshabilitado exitosamente',
      user: updated
    });
  } catch (error) {
    console.error('Error cambiando estado de usuario:', error);
    return res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

/**
 * Resetear contraseña de un asesor (Genera nueva clave temporal y marca mustChangePassword = true)
 */
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si no se envía contraseña, generar una aleatoria (criptográficamente segura) fácil de compartir
    if (newPassword) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }
    const generatedPass = newPassword || generateTempPassword();
    const passwordHash = await bcrypt.hash(generatedPass, 10);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true // Forzar al usuario a cambiarla al entrar
      }
    });

    // Cierra las sesiones abiertas de ese usuario: los tokens anteriores dejan de ser válidos
    await bumpTokenVersion(id);

    return res.json({
      message: 'Contraseña reseteada con éxito',
      email: targetUser.email,
      name: targetUser.name,
      tempPassword: generatedPass
    });
  } catch (error) {
    console.error('Error reseteando contraseña:', error);
    return res.status(500).json({ error: 'Error al resetear contraseña' });
  }
};

/**
 * Enviar notificación push masiva o individual desde el panel de Admin
 */
const sendCustomNotification = async (req, res) => {
  try {
    const { title, body, targetUserId, url = '/' } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Título y mensaje son requeridos' });
    }

    const payload = {
      title: `📢 ${title}`,
      body,
      url,
      icon: '/icons/icon.svg'
    };

    let result;
    if (targetUserId && targetUserId !== 'ALL') {
      result = await sendPushToUser(targetUserId, payload);
    } else {
      result = await sendBroadcastPush(payload);
    }

    return res.json({
      success: true,
      message: 'Notificación procesada',
      sentCount: result?.sentCount ?? 0,
      failedCount: result?.failedCount ?? 0
    });
  } catch (error) {
    console.error('Error enviando notificación administrativa:', error);
    return res.status(500).json({ error: 'Error al enviar notificación' });
  }
};

/**
 * Estadísticas generales para el administrador
 */
const getAdminStats = async (req, res) => {
  try {
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const inactiveUsers = await prisma.user.count({ where: { isActive: false } });
    const pendingCount = await prisma.reminder.count({ where: { status: 'PENDING' } });
    const completedCount = await prisma.reminder.count({ where: { status: 'COMPLETED' } });
    const dismissedCount = await prisma.reminder.count({ where: { status: 'DISMISSED' } });

    return res.json({
      activeUsers,
      inactiveUsers,
      pendingCount,
      completedCount,
      dismissedCount
    });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    return res.status(500).json({ error: 'Error al obtener métricas' });
  }
};

// --- Integración con Chatrace (solo administradores) --------------------------------------------------------------
const CHATRACE_ADMIN_TIMEOUT_MS = 8000; // Tiempo máximo para consultas de configuración desde la app
const MAX_TAG_NAME_CHARS = 100;

const chatraceUnavailable = (res, err, stage) => {
  const kind = err?.kind || 'error';
  logWarn(stage, { kind, status: err?.status });
  const message = kind === 'disabled'
    ? 'La integración con Chatrace no está activada (falta configurar el token en el servidor).'
    : 'No se pudo consultar Chatrace en este momento. Intenta de nuevo.';
  return res.status(kind === 'disabled' ? 503 : 502).json({ error: message, kind });
};

/**
 * Valida el nombre de etiqueta recibido y se asegura de que exista en Chatrace.
 * Si no existe, solo se crea cuando el administrador lo pide expresamente (create: true).
 * Devuelve { name } o { error, status } listo para responder. Nombre vacío = quitar la etiqueta.
 */
const resolveChatraceTag = async (rawName, create) => {
  const name = String(rawName ?? '').trim();
  if (!name) return { name: '' };
  if (name.length > MAX_TAG_NAME_CHARS) {
    return { status: 400, error: `El nombre de la etiqueta no puede superar ${MAX_TAG_NAME_CHARS} caracteres` };
  }
  const deadline = Date.now() + CHATRACE_ADMIN_TIMEOUT_MS;
  const existingId = await chatraceService.getTagId(name, { deadline });
  if (existingId) return { name };
  if (create !== true) {
    return { status: 404, error: 'Esa etiqueta no existe en Chatrace. Elige una existente o créala desde la app.' };
  }
  await chatraceService.createTag(name, { deadline });
  return { name, created: true };
};

/**
 * Estado de la integración: ¿hay token configurado? y etiqueta fija actual
 */
const getChatraceStatus = async (req, res) => {
  let fixedTag = null;
  let settingsAvailable = true;
  try {
    fixedTag = await chatraceSettings.getFixedTag();
  } catch (err) {
    settingsAvailable = false;
    logWarn('chatrace_config', { kind: 'settings_unavailable', errorName: err?.name, code: err?.code });
  }
  return res.json({ configured: chatraceService.isEnabled(), settingsAvailable, fixedTag });
};

/**
 * Lista las etiquetas existentes en Chatrace (para los selectores de la app)
 */
const getChatraceTags = async (req, res) => {
  try {
    const tags = await chatraceService.listTags({ deadline: Date.now() + CHATRACE_ADMIN_TIMEOUT_MS });
    return res.json({ tags });
  } catch (err) {
    return chatraceUnavailable(res, err, 'chatrace_admin_tags');
  }
};

/**
 * Elegir (o crear) la etiqueta fija que se aplica a todos los contactos sincronizados
 */
const setChatraceFixedTag = async (req, res) => {
  try {
    const resolved = await resolveChatraceTag(req.body?.name, req.body?.create);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    await chatraceSettings.setFixedTag(resolved.name, req.user.id);
    logInfo('chatrace_config', { action: 'fixed_tag_set', actorId: req.user.id, cleared: !resolved.name, tagCreated: Boolean(resolved.created) });
    return res.json({ fixedTag: resolved.name || null, created: Boolean(resolved.created) });
  } catch (err) {
    if (err?.name === 'ChatraceError') return chatraceUnavailable(res, err, 'chatrace_admin_fixed_tag');
    logError('chatrace_admin_fixed_tag', err, { actorId: req.user?.id });
    return res.status(500).json({ error: 'No se pudo guardar la etiqueta fija' });
  }
};

/**
 * Elegir (o crear) la etiqueta de Chatrace de un asesor
 */
const setUserChatraceTag = async (req, res) => {
  try {
    const { id } = req.params;
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    const resolved = await resolveChatraceTag(req.body?.name, req.body?.create);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

    await chatraceSettings.setAdvisorTag(id, resolved.name, req.user.id);
    logInfo('chatrace_config', { action: 'advisor_tag_set', actorId: req.user.id, targetId: id, cleared: !resolved.name, tagCreated: Boolean(resolved.created) });
    return res.json({ userId: id, chatraceTag: resolved.name || null, created: Boolean(resolved.created) });
  } catch (err) {
    if (err?.name === 'ChatraceError') return chatraceUnavailable(res, err, 'chatrace_admin_advisor_tag');
    logError('chatrace_admin_advisor_tag', err, { actorId: req.user?.id, targetId: req.params?.id });
    return res.status(500).json({ error: 'No se pudo guardar la etiqueta del asesor' });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUserRole,
  toggleUserStatus,
  resetUserPassword,
  sendCustomNotification,
  getAdminStats,
  getChatraceStatus,
  getChatraceTags,
  setChatraceFixedTag,
  setUserChatraceTag
};
