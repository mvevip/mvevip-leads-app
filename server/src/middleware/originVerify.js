const crypto = require('crypto');
const { logWarn, logError } = require('../utils/logger');
const { getClientIp } = require('../utils/clientIp');

/**
 * Verifica que la petición llegó a través de CloudFront. CloudFront agrega a cada petición al API Gateway la cabecera
 * secreta X-Origin-Verify; quien llame directo a la URL del API Gateway no la conoce y puede ser rechazado.
 *
 *   ORIGIN_VERIFY_SECRET            secreto vigente (debe coincidir con la cabecera configurada en CloudFront)
 *   ORIGIN_VERIFY_SECRET_PREVIOUS   secreto anterior, opcional: permite rotar sin interrumpir el servicio
 *   ORIGIN_VERIFY_MODE              off | log | enforce
 *                                   off     no verifica (por defecto si no hay secreto)
 *                                   log     registra las peticiones sin cabecera válida pero las deja pasar (por defecto si hay secreto)
 *                                   enforce rechaza con 403 las peticiones sin cabecera válida
 */
const HEADER_NAME = 'x-origin-verify';
const LOG_MAX_PER_MINUTE = 30;

let logWindowStart = 0;
let logCount = 0;
const shouldLog = () => {
  const now = Date.now();
  if (now - logWindowStart > 60 * 1000) {
    logWindowStart = now;
    logCount = 0;
  }
  return ++logCount <= LOG_MAX_PER_MINUTE;
};

const matches = (received, expected) => {
  if (!expected || typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const resolveMode = (secret) => {
  const configured = (process.env.ORIGIN_VERIFY_MODE || '').toLowerCase();
  if (!secret) {
    if (configured === 'enforce') {
      // Sin secreto no se puede verificar nada: se exigiría una cabecera imposible y se bloquearía todo el tráfico
      logError('origin_verify_misconfigured', new Error('ORIGIN_VERIFY_MODE=enforce sin ORIGIN_VERIFY_SECRET: verificación desactivada'));
    }
    return 'off';
  }
  return ['off', 'log', 'enforce'].includes(configured) ? configured : 'log';
};

const verifyOrigin = (req, res, next) => {
  const secret = process.env.ORIGIN_VERIFY_SECRET;
  const mode = resolveMode(secret);
  if (mode === 'off') {
    return next();
  }

  const received = req.headers[HEADER_NAME];
  if (matches(received, secret) || matches(received, process.env.ORIGIN_VERIFY_SECRET_PREVIOUS)) {
    return next();
  }

  if (shouldLog()) {
    logWarn('origin_verify_failed', {
      mode,
      reason: received ? 'invalid' : 'missing',
      method: req.method,
      path: req.path,
      ip: getClientIp(req)
    });
  }
  if (mode === 'enforce') {
    return res.status(403).json({ error: 'Acceso no permitido' });
  }
  return next();
};

module.exports = {
  verifyOrigin
};
