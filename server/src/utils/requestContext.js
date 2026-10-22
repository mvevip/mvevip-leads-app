const crypto = require('crypto');

// Una Lambda procesa una sola invocación a la vez por contenedor, por lo que un valor de módulo es seguro.
// Fuera de Lambda (desarrollo local) no se establece y cada consulta genera un id aleatorio.
let currentRequestId = null;
let currentSourceIp = null;

const setRequestId = (id) => {
  currentRequestId = id || null;
};

const getRequestId = () => currentRequestId || crypto.randomUUID();

// IP de origen que calcula API Gateway: detrás de CloudFront es la IP real del usuario y en una llamada directa la de la conexión
const setSourceIp = (ip) => {
  currentSourceIp = ip || null;
};

const getSourceIp = () => currentSourceIp;

module.exports = {
  setRequestId,
  getRequestId,
  setSourceIp,
  getSourceIp
};
