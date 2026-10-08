import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '../version';

const UpdateContext = createContext(null);

export function UpdateProvider({ children }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newVersionInfo, setNewVersionInfo] = useState({ version: APP_VERSION, notes: '' });

  // Comprobar actualización remota vía version.json
  const checkForUpdate = useCallback(async (manual = false) => {
    try {
      // Si el usuario ya descartó el aviso en esta sesión y no es una búsqueda manual, no molestar
      if (!manual && sessionStorage.getItem('mvevip_update_dismissed') === 'true') {
        return false;
      }

      // 1. Verificar si el archivo remoto /version.json tiene una versión distinta
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (res.ok) {
        const data = await res.json();
        
        // Si el servidor tiene la misma versión que la app compilada, la app YA está actualizada
        if (!data.version || data.version === APP_VERSION) {
          localStorage.setItem('mvevip_app_version', APP_VERSION);
          setUpdateAvailable(false);
          return false;
        }

        // Si la versión del servidor es diferente a la actual compilada
        setNewVersionInfo({
          version: data.version,
          notes: data.notes || 'Nueva actualización disponible con mejoras'
        });

        // Comprobar si hay un Service Worker esperando
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update().catch(() => {});
            if (registration.waiting) {
              setWaitingWorker(registration.waiting);
            }
          }
        }

        setUpdateAvailable(true);
        return true;
      }
    } catch (err) {
      console.warn('Error al verificar actualización:', err);
    }

    if (manual) {
      return false;
    }
    return false;
  }, []);

  useEffect(() => {
    // Al montar la app con la versión compilada actual, sincronizar localStorage
    localStorage.setItem('mvevip_app_version', APP_VERSION);

    // Registrar Service Worker y escuchar actualizaciones
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        // Escuchar cuando un nuevo SW se instala y queda en espera
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
            }
          });
        });
      }).catch((err) => {
        console.warn('Error registrando Service Worker:', err);
      });

      // Recargar si el controller cambia tras skipWaiting
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Chequeo periódico cada 60 segundos
    const interval = setInterval(() => {
      checkForUpdate(false);
    }, 60 * 1000);

    // Chequeo cuando el usuario reabre la app o vuelve a la pestaña
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkForUpdate]);

  // Ejecutar la actualización inmediatamente
  const updateApp = async () => {
    setIsUpdating(true);
    localStorage.setItem('mvevip_app_version', newVersionInfo.version || APP_VERSION);
    sessionStorage.removeItem('mvevip_update_dismissed');

    try {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (e) {
      console.error('Error aplicando actualización:', e);
      window.location.reload();
    }
  };

  const dismissUpdate = () => {
    sessionStorage.setItem('mvevip_update_dismissed', 'true');
    setUpdateAvailable(false);
  };

  const openUpdateModal = () => {
    setUpdateAvailable(true);
  };

  return (
    <UpdateContext.Provider
      value={{
        updateAvailable,
        isUpdating,
        newVersionInfo,
        currentVersion: APP_VERSION,
        updateApp,
        dismissUpdate,
        checkForUpdate,
        openUpdateModal
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate debe usarse dentro de un UpdateProvider');
  }
  return context;
}
