const prisma = require('./prismaClient');
const { logError } = require('./logger');

// Versión de sesión del usuario (users.tokenVersion). Un token solo es válido si lleva la versión vigente;
// al resetear la contraseña desde el panel de administración se incrementa y los tokens anteriores dejan de servir.
// Tolerante a fallos: si no se puede leer, se devuelve null y no se invalida ninguna sesión.

const CACHE_TTL_MS = 30 * 1000;       // La revocación tarda como máximo esto en aplicarse en cada contenedor
const ERROR_LOG_INTERVAL_MS = 60 * 1000;

const cache = new Map(); // userId -> { version, expiresAt }
let lastErrorLogAt = 0;

const logThrottled = (stage, error) => {
  if (Date.now() - lastErrorLogAt > ERROR_LOG_INTERVAL_MS) {
    lastErrorLogAt = Date.now();
    logError(stage, error);
  }
};

const getTokenVersion = async (userId, { fresh = false } = {}) => {
  const cached = cache.get(userId);
  if (!fresh && cached && cached.expiresAt > Date.now()) {
    return cached.version;
  }

  try {
    const rows = await prisma.$queryRaw`SELECT tokenVersion FROM users WHERE id = ${userId} LIMIT 1`;
    if (!rows[0]) {
      return null;
    }
    const version = Number(rows[0].tokenVersion);
    cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
    return version;
  } catch (error) {
    logThrottled('token_version_read', error);
    return null;
  }
};

const bumpTokenVersion = async (userId) => {
  try {
    await prisma.$executeRaw`UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ${userId}`;
    cache.delete(userId);
    return true;
  } catch (error) {
    logError('token_version_bump', error, { userId });
    return false;
  }
};

const clearCache = () => cache.clear();

module.exports = {
  getTokenVersion,
  bumpTokenVersion,
  clearCache
};
