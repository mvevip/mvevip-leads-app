const crypto = require('crypto');

// Una Lambda procesa una sola invocación a la vez por contenedor, por lo que un valor de módulo es seguro.
// Fuera de Lambda (desarrollo local) no se establece y cada consulta genera un id aleatorio.
let currentRequestId = null;

const setRequestId = (id) => {
  currentRequestId = id || null;
};

const getRequestId = () => currentRequestId || crypto.randomUUID();

module.exports = {
  setRequestId,
  getRequestId
};
