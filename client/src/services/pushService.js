import api from './api';

// Convertir base64 URL-safe a Uint8Array para el Service Worker
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registra el Service Worker y suscribe al usuario a notificaciones Push con VAPID
 */
export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Este dispositivo o navegador no soporta Push Notifications nativas.');
    return { success: false, reason: 'unsupported' };
  }

  try {
    // 1. Registrar Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // 2. Solicitar permiso al usuario
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, reason: 'permission_denied' };
    }

    // 3. Obtener clave pública VAPID del backend
    let vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      const res = await api.get('/push/public-key');
      vapidPublicKey = res.data.publicKey;
    }

    if (!vapidPublicKey) {
      throw new Error('VAPID public key no disponible');
    }

    // 4. Suscribirse con PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    // 5. Enviar suscripción al backend
    await api.post('/push/subscribe', subscription.toJSON());
    return { success: true };
  } catch (error) {
    console.error('Error registrando notificaciones Push:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar notificación de prueba inmediata
 */
export async function triggerTestPush() {
  return await api.post('/push/test');
}
