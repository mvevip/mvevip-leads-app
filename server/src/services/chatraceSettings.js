/**
 * Configuración de la integración con Chatrace guardada en la tabla `app_settings` (clave/valor):
 *   chatrace.fixed_tag             -> etiqueta fija, se aplica a todos los contactos sincronizados
 *   chatrace.advisor_tag.<userId>  -> etiqueta de ese asesor
 * Quitar una etiqueta guarda una cadena vacía (se interpreta como "sin etiqueta"): no se borran filas.
 * La tabla se crea con deploy/migrations/002_chatrace.sql; si aún no existe, los llamadores deben tolerar el error.
 */

const prisma = require('../utils/prismaClient');

const FIXED_TAG_KEY = 'chatrace.fixed_tag';
const ADVISOR_PREFIX = 'chatrace.advisor_tag.';
const MAX_TAG_CHARS = 191;

const advisorKey = (userId) => `${ADVISOR_PREFIX}${userId}`;
const clean = (name) => String(name || '').trim().slice(0, MAX_TAG_CHARS);

const getValue = async (key) => {
  const row = await prisma.appSetting.findUnique({ where: { settingKey: key } });
  return row?.settingValue || null;
};

const setValue = (key, value, updatedBy) => prisma.appSetting.upsert({
  where: { settingKey: key },
  create: { settingKey: key, settingValue: value, updatedBy: updatedBy || null },
  update: { settingValue: value, updatedBy: updatedBy || null }
});

const getFixedTag = () => getValue(FIXED_TAG_KEY);
const setFixedTag = (name, updatedBy) => setValue(FIXED_TAG_KEY, clean(name), updatedBy);

const getAdvisorTag = (userId) => getValue(advisorKey(userId));
const setAdvisorTag = (userId, name, updatedBy) => setValue(advisorKey(userId), clean(name), updatedBy);

/** Etiquetas de varios asesores de una vez: { [userId]: 'nombre' } (solo los que tienen etiqueta) */
const getAdvisorTags = async (userIds) => {
  if (!userIds.length) return {};
  const rows = await prisma.appSetting.findMany({ where: { settingKey: { in: userIds.map(advisorKey) } } });
  const result = {};
  rows.forEach((row) => {
    if (row.settingValue) result[row.settingKey.slice(ADVISOR_PREFIX.length)] = row.settingValue;
  });
  return result;
};

module.exports = { getFixedTag, setFixedTag, getAdvisorTag, setAdvisorTag, getAdvisorTags };
