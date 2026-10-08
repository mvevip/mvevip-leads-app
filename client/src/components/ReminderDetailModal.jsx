import React, { useState } from 'react';
import { X, CheckCircle2, ArrowRightLeft, AlertTriangle, Clock, User, Phone, RotateCcw, Calendar } from 'lucide-react';
import api from '../services/api';

export default function ReminderDetailModal({ reminder, isOpen, onClose, onUpdated, users = [], currentUser }) {
  const [activeAction, setActiveAction] = useState(null); // 'dismiss', 'transfer', 'followup', 'reschedule'
  const [dismissReason, setDismissReason] = useState('');
  const [transferUserId, setTransferUserId] = useState('');
  const [followupNote, setFollowupNote] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen || !reminder) return null;

  // Formato local para input datetime-local
  const getInitialDateTime = () => {
    const d = new Date(reminder.scheduledAt || Date.now());
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.patch(`/reminders/${reminder.id}/complete`, { note: 'Gestión completada con éxito' });
      onUpdated();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al completar');
    } finally {
      setLoading(false);
    }
  };

  // Reactivar o Reprogramar (cambiar fecha/hora y volver a Pendiente)
  const handleReopenOrReschedule = async () => {
    setLoading(true);
    try {
      await api.patch(`/reminders/${reminder.id}/reopen`, {
        newScheduledAt: rescheduleDate ? new Date(rescheduleDate).toISOString() : undefined,
        note: followupNote || (rescheduleDate ? 'Cliente solicitó nuevo contacto' : 'Reabierto a pendientes')
      });
      onUpdated();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al reagendar/reactivar');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!dismissReason.trim()) {
      setErrorMsg('El motivo de la baja es estrictamente obligatorio.');
      return;
    }
    setLoading(true);
    try {
      await api.patch(`/reminders/${reminder.id}/dismiss`, { dismissReason });
      onUpdated();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al dar de baja');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferUserId) {
      setErrorMsg('Selecciona al asesor de destino.');
      return;
    }
    setLoading(true);
    try {
      await api.patch(`/reminders/${reminder.id}/transfer`, { newAssignedId: transferUserId, note: followupNote });
      onUpdated();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al transferir');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFollowup = async () => {
    if (!followupNote.trim()) return;
    setLoading(true);
    try {
      await api.post(`/reminders/${reminder.id}/followups`, { note: followupNote });
      setFollowupNote('');
      setActiveAction(null);
      onUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al agregar seguimiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3">
      <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-5">
        
        {/* Cabecera */}
        <div className="flex justify-between items-start pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                reminder.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                reminder.status === 'DISMISSED' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {reminder.status === 'COMPLETED' ? 'Terminado' :
                 reminder.status === 'DISMISSED' ? 'Dado de Baja' : 'Pendiente'}
              </span>
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(reminder.scheduledAt).toLocaleString('es-EC')}
              </span>
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mt-1 leading-tight">
              {reminder.title}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600">
            {errorMsg}
          </div>
        )}

        {/* Datos del Cliente y Asignación */}
        <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Cliente:</span>
            <span className="font-bold text-slate-800">{reminder.clientName}</span>
          </div>

          {reminder.clientPhone && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Phone className="w-3 h-3" /> Teléfono:
              </span>
              <a href={`tel:${reminder.clientPhone}`} className="font-semibold text-blue-600 underline">
                {reminder.clientPhone}
              </a>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <User className="w-3 h-3" /> Asesor Asignado:
            </span>
            <span className="font-semibold text-slate-700">{reminder.assigned?.name || 'Sin asignar'}</span>
          </div>

          {reminder.description && (
            <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-600 leading-relaxed">
              {reminder.description}
            </div>
          )}
        </div>

        {/* Motivo de baja si existe */}
        {reminder.dismissReason && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-700">
            <span className="font-bold block">Motivo de la Baja:</span>
            {reminder.dismissReason}
          </div>
        )}

        {/* BOTONES DE ACCIÓN PARA RECORDATORIO PENDIENTE */}
        {reminder.status === 'PENDING' && !activeAction && (
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            <button
              onClick={handleComplete}
              disabled={loading}
              className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Completar</span>
            </button>

            <button
              onClick={() => {
                setRescheduleDate(getInitialDateTime());
                setActiveAction('reschedule');
              }}
              className="py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>Reagendar</span>
            </button>

            <button
              onClick={() => setActiveAction('transfer')}
              className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Transferir</span>
            </button>

            <button
              onClick={() => setActiveAction('dismiss')}
              className="py-2.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
            >
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>Dar Baja</span>
            </button>
          </div>
        )}

        {/* BOTONES DE ACCIÓN PARA RECORDATORIO TERMINADO O DADO DE BAJA */}
        {reminder.status !== 'PENDING' && !activeAction && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setRescheduleDate(getInitialDateTime());
                setActiveAction('reschedule');
              }}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reactivar a Pendientes con Nueva Fecha</span>
            </button>
          </div>
        )}

        {/* PANEL: REAGENDAR / REACTIVAR CON NUEVA FECHA Y HORA */}
        {activeAction === 'reschedule' && (
          <div className="mt-4 p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl">
            <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs mb-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Reagendar / Nueva Fecha de Gestión</span>
            </div>

            <label className="block text-[11px] text-slate-600 font-semibold mb-1">
              Nueva fecha y hora (Quito UTC-5):
            </label>
            <input
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-blue-700"
            />

            <label className="block text-[11px] text-slate-600 font-semibold mt-2 mb-1">
              Motivo o nota de la reprogramación:
            </label>
            <input
              type="text"
              value={followupNote}
              onChange={(e) => setFollowupNote(e.target.value)}
              placeholder="Ej: Cliente pidió volver a llamar el lunes porque está en reunión..."
              className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs text-slate-800"
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setActiveAction(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={handleReopenOrReschedule}
                className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
              >
                Guardar y Pasar a Pendientes
              </button>
            </div>
          </div>
        )}

        {/* PANEL: DAR DE BAJA */}
        {activeAction === 'dismiss' && (
          <div className="mt-4 p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl">
            <span className="text-xs font-bold text-rose-900 block mb-1">
              Observación obligatoria para dar de baja:
            </span>
            <textarea
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Ej: Prospecto indicó que ya adquirió otra alternativa / No contesta llamadas tras 3 intentos..."
              className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setActiveAction(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={handleDismiss}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl shadow-xs"
              >
                Confirmar Baja
              </button>
            </div>
          </div>
        )}

        {/* PANEL: TRANSFERIR A OTRO ASESOR */}
        {activeAction === 'transfer' && (
          <div className="mt-4 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl">
            <span className="text-xs font-bold text-indigo-900 block mb-1">
              Seleccionar nuevo asesor:
            </span>
            <select
              value={transferUserId}
              onChange={(e) => setTransferUserId(e.target.value)}
              className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800"
            >
              <option value="">-- Seleccionar Asesor --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <input
              type="text"
              value={followupNote}
              onChange={(e) => setFollowupNote(e.target.value)}
              placeholder="Nota para el nuevo asesor (opcional)..."
              className="w-full mt-2 p-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setActiveAction(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                onClick={handleTransfer}
                className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl shadow-xs"
              >
                Transferir Lead
              </button>
            </div>
          </div>
        )}

        {/* BITÁCORA DE SEGUIMIENTO */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-extrabold text-slate-800 text-xs">Bitácora de Seguimiento</h4>
            <button
              onClick={() => setActiveAction(activeAction === 'followup' ? null : 'followup')}
              className="text-[11px] font-bold text-blue-600 hover:underline"
            >
              + Agregar Nota
            </button>
          </div>

          {activeAction === 'followup' && (
            <div className="mb-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <textarea
                rows={2}
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="Escribe la observación del seguimiento..."
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setActiveAction(null)}
                  className="px-3 py-1.5 text-xs text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddFollowup}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}

          {/* Lista de notas registradas */}
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {reminder.followups && reminder.followups.length > 0 ? (
              reminder.followups.map((f) => (
                <div key={f.id} className="p-2.5 bg-slate-50 rounded-xl text-xs">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-semibold text-slate-600">{f.user?.name || 'Asesor'}</span>
                    <span>{new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-700">{f.note}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No hay notas registradas aún.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
