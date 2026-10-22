const crypto = require('crypto');

/**
 * Protege la ruta HTTP del cron. En producción el cron lo invoca EventBridge directamente sobre la Lambda,
 * por lo que esta ruta queda deshabilitada (404) salvo que exista CRON_SECRET y se envíe en x-cron-secret.
 */
const requireCronSecret = (req, res, next) => {
  const expected = process.env.CRON_SECRET;
  const received = req.headers['x-cron-secret'];

  if (expected && typeof received === 'string') {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return next();
    }
  }
  return res.status(404).json({ error: 'Ruta no encontrada' });
};

module.exports = {
  requireCronSecret
};
