import React from 'react';
import { useUpdate } from '../context/UpdateContext';
import { RefreshCw, Sparkles, ArrowUpCircle, CheckCircle2, X } from 'lucide-react';

export default function UpdatePromptModal() {
  const { updateAvailable, isUpdating, newVersionInfo, updateApp, dismissUpdate } = useUpdate();

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden transform transition-all animate-in slide-in-from-bottom duration-300">
        
        {/* Glow de acento con color #9AC31C */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#9AC31C]/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[#9AC31C]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Botón cerrar / posponer */}
        <button
          onClick={dismissUpdate}
          disabled={isUpdating}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 rounded-full transition-colors"
          title="Posponer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado con Icono Grande */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#9AC31C]/20 border border-[#9AC31C]/40 flex items-center justify-center text-[#9AC31C] mb-4 shadow-lg shadow-[#9AC31C]/10">
            <ArrowUpCircle className="w-9 h-9 animate-bounce" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#9AC31C]/15 border border-[#9AC31C]/30 text-[#6B8A0E] dark:text-[#9AC31C] text-[11px] font-extrabold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Nueva Versión Disponible (v{newVersionInfo.version})
          </div>

          {/* TÍTULO GRANDE SOLICITADO */}
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-neutral-100 tracking-tight leading-snug">
            Actualiza la app a su última versión
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-neutral-300 leading-relaxed max-w-sm">
            {newVersionInfo.notes || 'Hemos incluido correcciones en las notificaciones push y mejoras de rendimiento. Toca el botón para actualizar ahora al instante.'}
          </p>
        </div>

        {/* Beneficios breves */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-neutral-800/80 rounded-2xl border border-slate-100 dark:border-neutral-700/60 space-y-1.5 text-xs text-slate-700 dark:text-neutral-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#9AC31C] shrink-0" />
            <span>Persistencia automática de notificaciones push</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#9AC31C] shrink-0" />
            <span>Actualización instantánea sin pérdida de sesión</span>
          </div>
        </div>

        {/* Botón de Acción Principal */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={updateApp}
            disabled={isUpdating}
            className="w-full py-3.5 px-5 bg-[#9AC31C] hover:bg-[#86AB17] active:scale-[0.98] text-neutral-950 font-black text-sm rounded-2xl shadow-lg shadow-[#9AC31C]/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-75"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Actualizando aplicación...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Actualizar Ahora
              </>
            )}
          </button>

          <button
            onClick={dismissUpdate}
            disabled={isUpdating}
            className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 transition-colors"
          >
            Recordar más tarde
          </button>
        </div>

      </div>
    </div>
  );
}
