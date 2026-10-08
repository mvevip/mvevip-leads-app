const app = require('./app');
const { startReminderScheduler } = require('./services/cronScheduler');

const PORT = process.env.PORT_BACKEND || process.env.PORT || 6411;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor MVEVIP Lead API escuchando en http://0.0.0.0:${PORT}`);
  console.log(`📡 Rango de puertos configurado: API Backend en ${PORT}`);
  
  // Iniciar Cron Scheduler de Notificaciones
  startReminderScheduler();
});
