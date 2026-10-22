const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { logWarn, logError } = require('../utils/logger');

// Registra los envíos push fallidos por dispositivo (sin el endpoint ni el contenido de la notificación)
const logFailedDeliveries = (results, context = {}) => {
  results.forEach((result) => {
    if (result.status === 'rejected') {
      const statusCode = result.reason && result.reason.statusCode;
      logWarn('push_delivery_failed', {
        ...context,
        statusCode,
        subscriptionRemoved: statusCode === 410 || statusCode === 404,
        errorName: result.reason && result.reason.name
      });
    }
  });
};

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@mvevip.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push VAPID configurado correctamente.');
} else {
  console.warn('⚠️ VAPID keys no encontradas en el entorno.');
}

const sendPushToUser = async (userId, payload) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    if (!subscriptions || subscriptions.length === 0) {
      return { success: false, message: 'Usuario sin suscripciones push activas' };
    }

    const payloadString = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey
          }
        };

        try {
          return await webpush.sendNotification(pushSubscription, payloadString);
        } catch (err) {
          // Si el endpoint expiró o fue desuscrito (410 Gone / 404), limpiar de BD
          if (err.statusCode === 410 || err.statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
          throw err;
        }
      })
    );

    logFailedDeliveries(results, { userId });

    return {
      success: true,
      sentCount: results.filter((r) => r.status === 'fulfilled').length,
      failedCount: results.filter((r) => r.status === 'rejected').length
    };
  } catch (error) {
    logError('push_send', error, { userId });
    return { success: false, error: error.message };
  }
};

const sendBroadcastPush = async (payload) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany();
    const payloadString = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey
          }
        };
        try {
          return await webpush.sendNotification(pushSubscription, payloadString);
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
          throw err;
        }
      })
    );

    logFailedDeliveries(results, { broadcast: true });

    return {
      success: true,
      sentCount: results.filter((r) => r.status === 'fulfilled').length,
      failedCount: results.filter((r) => r.status === 'rejected').length
    };
  } catch (error) {
    logError('push_broadcast', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPushToUser,
  sendBroadcastPush,
  VAPID_PUBLIC_KEY
};
