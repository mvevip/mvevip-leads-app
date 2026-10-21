const crypto = require('crypto');

// Una Lambda procesa una sola invocación a la vez por contenedor, por lo que un valor de módulo es seguro.
// Fuera de Lambda (desarrollo local) no se establece y cada consulta genera un id aleatorio.
let currentRequestId = null;
let currentSourceIp = null;

const setRequestId = (id) => {
  currentRequestId = id || null;
};

const getRequestId = () => currentRequestId || crypto.randomUUID();

// IP que se conectó al API Gateway (detrás de CloudFront es la del servidor de CloudFront, no la del usuario)
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
