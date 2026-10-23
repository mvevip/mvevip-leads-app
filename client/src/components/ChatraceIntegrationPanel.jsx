import React from 'react';
import api from '../services/api';
import { Link2, RefreshCw, Loader2 } from 'lucide-react';
import ChatraceTagPicker, { useChatraceTags } from './ChatraceTagPicker';

/**
 * Panel de administración de la integración con Chatrace (solo administradores, en Perfil).
 * Muestra el estado de la conexión y permite elegir o crear la etiqueta fija que se aplica a todos los contactos
 * sincronizados. La etiqueta de cada asesor se elige en «Gestionar Usuarios & Asesores».
 */
export default function ChatraceIntegrationPanel() {
  const chatrace = useChatraceTags(true);

  const badge = (() => {
    if (chatrace.loading && chatrace.configured === null) return { text: 'Consultando…', tone: 'bg-slate-200 text-slate-600 dark:bg-neutral-700 dark:text-neutral-300' };
    if (chatrace.error) return { text: 'Sin conexión', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
    if (chatrace.configured) return { text: 'Conectada', tone: 'bg-[#9AC31C]/20 text-[#6B8A0E] dark:text-[#9AC31C]' };
    return { text: 'No activada', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
  })();

  const saveFixedTag = async (name, create) => {
    await api.put('/admin/chatrace/fixed-tag', { name, create });
    await chatrace.reload();
  };

  return (
    <div className="p-3 bg-slate-50 dark:bg-neutral-750 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-neutral-200">
          <Link2 className="w-4 h-4 text-[#9AC31C]" /> Integración Chatrace
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.tone}`}>{badge.text}</span>
          <button
            type="button"
            onClick={chatrace.reload}
            disabled={chatrace.loading}
            title="Volver a consultar Chatrace"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 disabled:opacity-50"
          >
            {chatrace.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {chatrace.error && (
        <p role="alert" className="text-[10px] text-rose-500">{chatrace.error}</p>
      )}

      {chatrace.configured === false && (
        <p className="text-[10px] text-slate-500 dark:text-neutral-400">
          Aún no está activada: falta cargar el token de Chatrace en el servidor. Mientras tanto, los recordatorios funcionan con normalidad y no se sincronizan.
        </p>
      )}

      {chatrace.configured && chatrace.settingsAvailable === false && (
        <p role="alert" className="text-[10px] text-amber-600 dark:text-amber-400">
          No se puede guardar la configuración todavía: falta ejecutar la migración 002 en la base de datos.
        </p>
      )}

      {chatrace.configured && (
        <div>
          <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 block mb-1">Etiqueta fija (se aplica a todos los contactos sincronizados)</span>
          <ChatraceTagPicker
            variant="themed"
            value={chatrace.fixedTag || ''}
            tags={chatrace.tags}
            onSave={saveFixedTag}
            disabled={chatrace.settingsAvailable === false}
          />
          <span className="text-[10px] text-slate-400 dark:text-neutral-400 block mt-1.5">
            La etiqueta de cada asesor se elige en «Gestionar Usuarios &amp; Asesores».
          </span>
        </div>
      )}
    </div>
  );
}
