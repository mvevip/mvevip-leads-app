/**
 * Sincroniza el cliente de un recordatorio recién creado con Chatrace.
 *
 * GARANTÍA: esta función NUNCA lanza. Cualquier fallo (red, token, base de datos, etc.) se registra en los logs
 * y se devuelve como resultado; el recordatorio y la respuesta del chat quedan exactamente como si Chatrace no existiera.
 * El resultado nunca incluye teléfono, nombre ni respuestas crudas de Chatrace (viaja al modelo, al historial y a la pantalla).
 */

const chatraceService = require('./chatraceService');
const chatraceSettings = require('./chatraceSettings');
const { logInfo, logWarn } = require('../utils/logger');

const MIN_REMAINING_MS = 6000; // Si al turno le queda menos que esto, no se sincroniza (prioridad: responder al usuario)
const SYNC_BUDGET_MS = 4000;   // Tope de tiempo para toda la sincronización

const defaultDeps = { chatrace: chatraceService, settings: chatraceSettings };

const syncReminderContact = async (
  { reminderId, userId, clientName, clientPhone, assignedId, deadline },
  deps = defaultDeps
) => {
  const startedAt = Date.now();
  const finish = (result) => {
    logInfo('chatrace_sync', {
      reminderId,
      userId,
      status: result.status,
      reason: result.reason,
      created: result.created,
      tagsApplied: result.tagsApplied,
      tagsFailed: result.tagsFailed,
      durationMs: Date.now() - startedAt
    });
    return result;
  };

  try {
    if (!deps.chatrace.isEnabled()) return { status: 'skipped', reason: 'disabled' };
    if (!clientPhone) return finish({ status: 'skipped', reason: 'no_phone' });
    if (deadline && deadline - Date.now() < MIN_REMAINING_MS) return finish({ status: 'skipped', reason: 'no_time' });

    // Etiquetas configuradas: la fija y la del asesor asignado. Si no se pueden leer, se sincroniza sin etiquetas.
    const tags = [];
    try {
      const [fixed, advisor] = await Promise.all([
        deps.settings.getFixedTag(),
        assignedId ? deps.settings.getAdvisorTag(assignedId) : null
      ]);
      if (fixed) tags.push(fixed);
      if (advisor) tags.push(advisor);
    } catch (err) {
      logWarn('chatrace_config', { kind: 'settings_unavailable', errorName: err?.name, code: err?.code });
    }

    const syncDeadline = Math.min(deadline || Infinity, Date.now() + SYNC_BUDGET_MS);
    const result = await deps.chatrace.syncContact({ name: clientName, phone: clientPhone, tags, deadline: syncDeadline });
    return finish(result);
  } catch (err) {
    // Último recurso: ningún error puede escapar de aquí. Solo se registra el tipo, nunca el mensaje.
    logWarn('chatrace_sync_failed', { reminderId, userId, kind: 'unexpected', errorName: err?.name });
    return { status: 'failed', reason: 'error' };
  }
};

/**
 * Resultado apto para mostrar al modelo y a la pantalla: solo estado y motivo (nada de datos del cliente) más una frase natural.
 * Devuelve null cuando la integración está desactivada: en ese caso el chat no cambia en absoluto.
 */
const toToolResult = (result) => {
  if (!result || result.reason === 'disabled') return null;
  const messages = {
    synced: result.created
      ? 'El cliente quedó registrado como contacto nuevo en Chatrace, con sus etiquetas.'
      : 'El cliente ya existía en Chatrace y se le agregaron las etiquetas.',
    partial: 'El cliente quedó en Chatrace, pero alguna etiqueta no se pudo aplicar.',
    skipped: result.reason === 'no_phone'
      ? 'No se sincronizó con Chatrace porque el compromiso no tiene el teléfono del cliente.'
      : result.reason === 'invalid_phone'
        ? 'No se sincronizó con Chatrace porque el teléfono del cliente no es válido (falta el código de país o tiene un formato que no se reconoce).'
        : 'No se sincronizó con Chatrace en este momento.',
    failed: 'No se pudo sincronizar con Chatrace; el compromiso quedó creado igualmente.'
  };
  return {
    status: result.status,
    reason: result.reason,
    created: Boolean(result.created),
    message: messages[result.status] || messages.failed
  };
};

module.exports = { syncReminderContact, toToolResult };
