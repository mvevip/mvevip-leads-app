require('dotenv').config({ path: '../.env' });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { logError, logWarn } = require('./utils/logger');
const { getRequestId } = require('./utils/requestContext');
const { signMediaResponses } = require('./middleware/signMedia');
const { verifyOrigin } = require('./middleware/originVerify');

const app = express();
app.disable('x-powered-by');

// Primer filtro: solo se acepta tráfico que pasó por CloudFront (cabecera secreta X-Origin-Verify)
app.use(verifyOrigin);

// Orígenes permitidos para CORS: la app en producción y el servidor de desarrollo local (configurable con CORS_ORIGINS, separado por comas)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://leads.mvevip.com,http://localhost:6410')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middlewares globales
app.use(cors({
  // Las peticiones sin Origin (misma origen, curl, servidor a servidor) pasan; las de otros sitios web se bloquean en el navegador
  origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cabeceras de seguridad de la API (las respuestas de la API son JSON y nunca deben guardarse en caché)
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  });
  next();
});

// Límites de tamaño del cuerpo JSON: 100 KB por defecto; solo las rutas que reciben imágenes en base64 admiten hasta 6 MB
// (límite real de una invocación de Lambda). El primer parser que procesa la petición es el que aplica.
const largeJson = express.json({ limit: '6mb' });
app.use('/api/auth/avatar', largeJson);
app.use('/api/auth/change-password', largeJson);
app.post('/api/admin/users', largeJson);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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
