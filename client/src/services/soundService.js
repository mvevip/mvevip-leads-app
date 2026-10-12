/**
 * Servicio de Sonido y Vibración para Notificaciones y Alertas (Web Audio API)
 * No requiere descargar archivos de audio externos (0 KB, latencia cero, funciona offline).
 */

class SoundService {
  constructor() {
    this.audioCtx = null;
    this.storageKey = 'mvevip_sound_enabled';
  }

  isSoundEnabled() {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(this.storageKey);
    return stored === null ? true : stored === 'true';
  }

  setSoundEnabled(enabled) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.storageKey, enabled ? 'true' : 'false');
  }

  getAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.audioCtx) {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Reproduce un chime elegante y moderno de dos notas (D5 -> A5)
   * con decaimiento natural tipo campana de notificación.
   */
  playNotificationSound() {
    if (!this.isSoundEnabled()) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Nota 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);

      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);

      // Nota 2: A5 (880 Hz) - Entrada ligeramente retrasada para acorde sucesivo
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now + 0.1);

      gain2.gain.setValueAtTime(0, now + 0.1);
      gain2.gain.linearRampToValueAtTime(0.28, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.1);
      osc2.stop(now + 0.7);

      // Disparar vibración en dispositivos compatibles
      this.triggerVibration();
    } catch (err) {
      console.warn('[SoundService] No se pudo reproducir tono:', err);
    }
  }

  /**
   * Dispara el patrón de vibración si el dispositivo cuenta con motor háptico
   */
  triggerVibration(pattern = [200, 100, 200, 100, 200]) {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignorar si el navegador bloquea la vibración
      }
    }
  }

  /**
   * Prueba interactiva que el usuario puede pulsar desde ajustes
   */
  testNotificationAlert() {
    this.playNotificationSound();
    this.triggerVibration();
  }
}

export const soundService = new SoundService();
export default soundService;
