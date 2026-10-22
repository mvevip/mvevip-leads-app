/**
 * Servicio de Sonido y Vibración para Notificaciones y Alertas (Web Audio API)
 * No requiere descargar archivos de audio externos (0 KB, latencia cero, funciona offline).
 */

class SoundService {
  constructor() {
    this.audioCtx = null;
    this.storageKey = 'mvevip_sound_enabled';
    this.volumeKey = 'mvevip_sound_volume';
    this.setupUnlock();
  }

  /**
   * Volumen del tono dentro de la app, de 0 a 1 (por defecto 1).
   * No afecta a las notificaciones push con la app cerrada: ese sonido lo pone el sistema operativo.
   */
  getVolume() {
    if (typeof window === 'undefined') return 1;
    const stored = parseFloat(localStorage.getItem(this.volumeKey));
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
  }

  setVolume(volume) {
    if (typeof window === 'undefined') return;
    const value = Math.min(1, Math.max(0, Number(volume) || 0));
    localStorage.setItem(this.volumeKey, String(value));
  }

  /**
   * Los navegadores (sobre todo iOS) solo permiten audio si el contexto se activó con un toque del usuario.
   * El tono de una push llega por un mensaje del Service Worker, sin toque, así que se prepara en el primer gesto.
   */
  setupUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.getAudioContext();
      ['pointerdown', 'touchstart', 'keydown'].forEach((evt) => window.removeEventListener(evt, unlock, true));
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((evt) => window.addEventListener(evt, unlock, { capture: true, passive: true }));
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
   * Programa el chime de tres notas (D5 -> A5 -> D6) en un contexto de audio.
   * Separado de la reproducción para poder renderizarlo y medirlo sin altavoces.
   * Las notas pasan por un limitador (no satura) y después por el volumen del usuario.
   */
  scheduleChime(ctx, destination, volume = 1, startTime = ctx.currentTime) {
    const now = startTime;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-6, now);
    limiter.knee.setValueAtTime(0, now);
    limiter.ratio.setValueAtTime(20, now);
    limiter.attack.setValueAtTime(0.001, now);
    limiter.release.setValueAtTime(0.1, now);

    // El volumen va DESPUES del limitador: así el control es proporcional en todo el rango
    const master = ctx.createGain();
    master.gain.setValueAtTime(volume, now);
    limiter.connect(master);
    master.connect(destination);

    const notes = [
      { freq: 587.33, type: 'triangle', at: 0, peak: 0.9, length: 0.7 },   // D5
      { freq: 880, type: 'triangle', at: 0.12, peak: 0.9, length: 0.8 },   // A5
      { freq: 1174.66, type: 'sine', at: 0.24, peak: 0.8, length: 1.0 }    // D6
    ];

    notes.forEach(({ freq, type, at, peak, length }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + at);

      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(peak, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + at + length);

      osc.connect(gain);
      gain.connect(limiter);
      osc.start(now + at);
      osc.stop(now + at + length + 0.05);
    });
  }

  /**
   * Reproduce el chime de notificación con el volumen configurado por el usuario.
   */
  playNotificationSound() {
    if (!this.isSoundEnabled()) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const volume = this.getVolume();
      if (volume > 0) {
        this.scheduleChime(ctx, ctx.destination, volume);
      }

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
