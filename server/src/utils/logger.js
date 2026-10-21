/**
 * Logging estructurado: una línea JSON por evento, fácil de filtrar en CloudWatch Logs
 * (ej: filter-log-events --filter-pattern '{ $.level = "error" }').
 * Nunca registrar contenido de mensajes de usuarios, tokens ni claves.
 */

const MAX_STACK_CHARS = 800;

const logError = (stage, error, context = {}) => {
  console.error(JSON.stringify({
    level: 'error',
    stage,
    errorName: error?.name,
    message: error?.message,
    status: error?.status || error?.statusCode,
    stack: error?.stack ? String(error.stack).slice(0, MAX_STACK_CHARS) : undefined,
    ...context
  }));
};

const logWarn = (stage, context = {}) => {
  console.warn(JSON.stringify({ level: 'warn', stage, ...context }));
};

const logInfo = (stage, context = {}) => {
  console.log(JSON.stringify({ level: 'info', stage, ...context }));
};

module.exports = {
  logError,
  logWarn,
  logInfo
};
