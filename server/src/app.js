require('dotenv').config({ path: '../.env' });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { logError, logWarn } = require('./utils/logger');
const { getRequestId } = require('./utils/requestContext');
const { signMediaResponses } = require('./middleware/signMedia');

const app = express();

// Middlewares globales
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Firma las URLs de archivos subidos (avatarUrl, mediaUrl, images) en todas las respuestas JSON
app.use(signMediaResponses);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mvevip-lead-server',
    timestamp: new Date().toISOString()
  });
});

// Rutas Principales
app.use('/api', apiRoutes);

// Manejador 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Mensajes seguros para el cliente según el código HTTP (el detalle técnico solo va a los logs)
const CLIENT_ERROR_MESSAGES = {
  400: 'Solicitud inválida',
  413: 'El contenido enviado es demasiado grande'
};

// Determina el código HTTP del error: body-parser y multer reportan errores del cliente (4xx)
const resolveErrorStatus = (err) => {
  if (err.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  }
  const status = err.status || err.statusCode;
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : 500;
};

// Manejador Global de Errores
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = resolveErrorStatus(err);
  const requestId = getRequestId();
  const context = { requestId, method: req.method, path: req.path, userId: req.user?.id };

  if (status >= 500) {
    logError('http', err, context);
    return res.status(500).json({ error: 'Error interno del servidor', requestId });
  }

  logWarn('http', { ...context, status, errorType: err.type || err.code || err.name });
  return res.status(status).json({ error: CLIENT_ERROR_MESSAGES[status] || CLIENT_ERROR_MESSAGES[400], requestId });
});

module.exports = app;
