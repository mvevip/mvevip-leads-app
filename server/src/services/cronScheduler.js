const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { sendPushToUser } = require('./webPushService');

const prisma = new PrismaClient();

/**
 * Tarea periódica ejecutada cada 60 segundos (* * * * *)
 * Revisa recordatorios pendientes cuya hora programada ya llegó o está en el rango de los próximos 5 minutos
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

      const result = await sendPushToUser(reminder.assignedId, payload);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { notificationSent: true }
      });

      console.log(`📲 Notificación enviada a asesor ${reminder.assigned.name}:`, result);
      results.push({ reminderId: reminder.id, result });
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
