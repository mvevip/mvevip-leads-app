const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { sendPushToUser } = require('./webPushService');
const { purgeOldEvents } = require('../utils/rateLimit');

const prisma = new PrismaClient();

// Si el push no pudo entregarse a ningún dispositivo, se reintenta cada minuto durante esta ventana
const RETRY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Tarea periódica ejecutada cada 60 segundos (* * * * *)
 * Revisa recordatorios pendientes cuya hora programada ya llegó.
 * Cada recordatorio se reclama de forma atómica (notificationSent: false -> true) antes de enviar,
 * para que dos ejecuciones solapadas no lo notifiquen dos veces. Si el envío no llega a ningún
 * dispositivo, se libera el reclamo para reintentar en la siguiente ejecución dentro de RETRY_WINDOW_MS.
 */
const checkAndNotifyDueReminders = async () => {
  try {
    const now = new Date();
    const dueReminders = await prisma.reminder.findMany({
      where: {
        status: 'PENDING',
        notificationSent: false,
        scheduledAt: {
          lte: now
        }
      },
      include: {
        assigned: true
      }
    });

    if (dueReminders.length > 0) {
      console.log(`🔔 Se encontraron ${dueReminders.length} recordatorios para notificar.`);
    }

    const results = [];
    for (const reminder of dueReminders) {
      const claim = await prisma.reminder.updateMany({
        where: { id: reminder.id, status: 'PENDING', notificationSent: false },
        data: { notificationSent: true }
      });
      if (claim.count === 0) {
        continue; // Otra ejecución ya lo tomó, o dejó de estar pendiente
      }

      const payload = {
        title: `⏰ Recordatorio Lead: ${reminder.clientName}`,
        body: `${reminder.title} - ${reminder.description || 'Sin notas adicionales'}`,
        url: `/#/reminders/${reminder.id}`,
        reminderId: reminder.id,
        priority: reminder.priority,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: {
          reminderId: reminder.id,
          scheduledAt: reminder.scheduledAt
        }
      };

      let result;
      try {
        result = await sendPushToUser(reminder.assignedId, payload);
      } catch (err) {
        result = { success: false, error: err.message };
      }

      const delivered = Boolean(result && result.success && result.sentCount > 0);
      const withinRetryWindow = now.getTime() - reminder.scheduledAt.getTime() < RETRY_WINDOW_MS;

      if (!delivered && withinRetryWindow) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { notificationSent: false }
        });
        console.warn(`⚠️ Push no entregado a asesor ${reminder.assigned.name}, se reintentará:`, result);
      } else if (delivered) {
        console.log(`📲 Notificación enviada a asesor ${reminder.assigned.name}:`, result);
      } else {
        console.warn(`⚠️ Push no entregado a asesor ${reminder.assigned.name} y venció la ventana de reintento:`, result);
      }

      results.push({ reminderId: reminder.id, delivered, result });
    }

    // Una vez por hora se eliminan los eventos de más de 24 h de la tabla del limitador de intentos
    if (now.getUTCMinutes() === 0) {
      await purgeOldEvents(24 * 60 * 60 * 1000);
    }

    return { count: dueReminders.length, results };
  } catch (err) {
    console.error('Error en ejecución del Cron Scheduler:', err);
    throw err;
  }
};

const startReminderScheduler = () => {
  console.log('⏰ Iniciando Planificador de Recordatorios (Cron Scheduler cada 60s)...');
  cron.schedule('* * * * *', async () => {
    await checkAndNotifyDueReminders();
  });
};

module.exports = {
  startReminderScheduler,
  checkAndNotifyDueReminders
};
