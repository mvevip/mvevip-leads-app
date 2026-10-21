const { signMediaUrl } = require('../services/s3Service');
const { logError } = require('../utils/logger');

// Campos de la respuesta JSON que contienen URLs de archivos subidos (uploads/)
const MEDIA_FIELDS = new Set(['avatarUrl', 'mediaUrl']);
const MEDIA_ARRAY_FIELDS = new Set(['images']);
const MAX_DEPTH = 10;

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

/**
 * Recorre el cuerpo de una respuesta y reemplaza las URLs de uploads/ por URLs firmadas.
 * Devuelve una copia; no modifica los objetos originales (por ejemplo, resultados de Prisma).
 */
const signMediaDeep = async (value, depth = 0) => {
  if (depth > MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => signMediaDeep(item, depth + 1)));
  }

  if (!isPlainObject(value)) {
    return value; // Date, Buffer, primitivos, null...
  }

  const entries = await Promise.all(Object.entries(value).map(async ([key, child]) => {
    if (MEDIA_FIELDS.has(key) && typeof child === 'string') {
      return [key, await signMediaUrl(child)];
    }
    if (MEDIA_ARRAY_FIELDS.has(key) && Array.isArray(child)) {
      return [key, await Promise.all(child.map((item) => (typeof item === 'string' ? signMediaUrl(item) : item)))];
    }
    return [key, await signMediaDeep(child, depth + 1)];
  }));

  return Object.fromEntries(entries);
};

/**
 * Middleware: envuelve res.json para firmar las URLs de archivos antes de enviar la respuesta.
 * Si la firma falla, se registra el error y se responde sin firmar (nunca se rompe la respuesta).
 */
const signMediaResponses = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    signMediaDeep(body)
      .then((signedBody) => originalJson(signedBody))
      .catch((error) => {
        logError('sign_media', error, { path: req.path });
        originalJson(body);
      });
    return res;
  };

  next();
};

module.exports = {
  signMediaResponses,
  signMediaDeep
};
