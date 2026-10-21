const crypto = require('crypto');
const prisma = require('./prismaClient');
const { logError } = require('./logger');

// Contadores en la tabla rate_limit_events (compartidos entre todos los contenedores de la Lambda).
// Tolerante a fallos: si la base falla, el limitador no bloquea a nadie y se registra el error,
// para que un problema del limitador nunca deje a los usuarios sin poder entrar.
// Las claves se guardan como hash SHA-256: la tabla no contiene correos ni IPs en claro.

const hashKey = (...parts) => crypto.createHash('sha256').update(parts.join('|')).digest('hex');

const countEvents = async (bucket, windowMs) => {
  try {
    const since = new Date(Date.now() - windowMs);
    const rows = await prisma.$queryRaw`SELECT COUNT(*) AS total FROM rate_limit_events WHERE bucket = ${bucket} AND createdAt > ${since}`;
    return Number(rows[0]?.total || 0);
  } catch (error) {
    logError('rate_limit_count', error);
    return 0;
  }
};

const recordEvent = async (...buckets) => {
  try {
    const now = new Date();
    for (const bucket of buckets) {
      await prisma.$executeRaw`INSERT INTO rate_limit_events (bucket, createdAt) VALUES (${bucket}, ${now})`;
    }
  } catch (error) {
    logError('rate_limit_record', error);
  }
};

const clearEvents = async (bucket) => {
  try {
    await prisma.$executeRaw`DELETE FROM rate_limit_events WHERE bucket = ${bucket}`;
  } catch (error) {
    logError('rate_limit_clear', error);
  }
};

const purgeOldEvents = async (olderThanMs) => {
  try {
    const before = new Date(Date.now() - olderThanMs);
    return await prisma.$executeRaw`DELETE FROM rate_limit_events WHERE createdAt < ${before}`;
  } catch (error) {
    logError('rate_limit_purge', error);
    return 0;
  }
};

module.exports = {
  hashKey,
  countEvents,
  recordEvent,
  clearEvents,
  purgeOldEvents
};
