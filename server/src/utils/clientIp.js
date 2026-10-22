const { getSourceIp } = require('./requestContext');

/**
 * IP del usuario para los límites de intentos.
 * Se usa la IP de origen que calcula API Gateway (requestContext.http.sourceIp): detrás de CloudFront es la IP real del
 * usuario y en una llamada directa al API Gateway es la IP de la conexión. En ambos casos el cliente no puede
 * falsificarla (verificado en producción con X-Forwarded-For inventados).
 * Se ignoran X-Forwarded-For (incluye entradas falsificables y IPs de servidores de CloudFront) y CloudFront-Viewer-Address
 * (se puede falsificar llamando directo al API Gateway). Fuera de Lambda (desarrollo local) se usa la IP de la conexión.
 */
const getClientIp = (req) => getSourceIp() || req.socket?.remoteAddress || 'unknown';

module.exports = {
  getClientIp
};
