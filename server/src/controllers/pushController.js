const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { VAPID_PUBLIC_KEY, sendPushToUser } = require('../services/webPushService');

/**
 * Obtener clave pública VAPID para el frontend
 */
const getPublicKey = (req, res) => {
  return res.json({ publicKey: VAPID_PUBLIC_KEY });
};

/**
 * Suscribir dispositivo a Push Notifications
 */
const subscribe = async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Datos de suscripción incompletos' });
    }

    // Upsert o guardar suscripción
    const existing = await prisma.pushSubscription.findFirst({
      where: { endpoint }
    });

    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: req.user.id,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
          userAgent: userAgent || req.headers['user-agent']
        }
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          userId: req.user.id,
          endpoint,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
          userAgent: userAgent || req.headers['user-agent']
        }
      });
    }

    return res.status(201).json({ message: 'Suscripción Push registrada exitosamente' });
  } catch (error) {
    console.error('Error registrando suscripción push:', error);
    return res.status(500).json({ error: 'Error al registrar suscripción push' });
  }
};

/**
 * Desuscribir dispositivo
 */
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint }
      });
    }
    return res.json({ message: 'Suscripción eliminada' });
  } catch (error) {
    console.error('Error al desuscribir:', error);
    return res.status(500).json({ error: 'Error al desuscribir' });
  }
};

/**
 * Enviar notificación de prueba al usuario actual
 */
const sendTestNotification = async (req, res) => {
  try {
    const payload = {
      title: '🎉 Notificaciones Push Activas',
      body: 'Recibirás recordatorios puntuales de tus leads incluso con la pantalla apagada.',
      url: '/',
      icon: '/icons/icon-192.png'
    };

    const result = await sendPushToUser(req.user.id, payload);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('Error enviando push de prueba:', error);
    return res.status(500).json({ error: 'Error en push de prueba' });
  }
};

module.exports = {
  getPublicKey,
  subscribe,
  unsubscribe,
  sendTestNotification
};
