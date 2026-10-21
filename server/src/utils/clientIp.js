const { getSourceIp } = require('./requestContext');

/**
 * IP del usuario detrás de CloudFront + API Gateway.
 * X-Forwarded-For llega como "[lo que envió el cliente...], IP_del_usuario[, IP_de_CloudFront]":
 * CloudFront agrega la IP real del usuario y API Gateway agrega la IP de CloudFront, así que lo que
 * el cliente falsifique queda siempre a la izquierda. Se toma la entrada anterior a la del
 * API Gateway (sourceIp) o, si API Gateway no agregó la suya, la última.
 */
const getClientIp = (req) => {
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const gatewayIp = getSourceIp();

  if (chain.length === 0) {
    return gatewayIp || req.socket?.remoteAddress || 'unknown';
  }
  if (gatewayIp && chain[chain.length - 1] === gatewayIp) {
    return chain.length >= 2 ? chain[chain.length - 2] : gatewayIp;
  }
  return chain[chain.length - 1];
};

module.exports = {
  getClientIp
};
