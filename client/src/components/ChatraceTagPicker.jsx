import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Loader2, X, Check } from 'lucide-react';

/**
 * Carga el estado de la integración con Chatrace y sus etiquetas (solo administradores).
 * `enabled` evita consultar mientras el panel está cerrado.
 */
export function useChatraceTags(enabled = true) {
  const [state, setState] = useState({
    loading: false,
    configured: null, // null = aún no se sabe
    settingsAvailable: true,
    fixedTag: null,
    tags: [],
    error: ''
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const status = (await api.get('/admin/chatrace/status')).data;
      if (!status.configured) {
        setState({ loading: false, configured: false, settingsAvailable: status.settingsAvailable, fixedTag: status.fixedTag, tags: [], error: '' });
        return;
      }
      const tags = (await api.get('/admin/chatrace/tags')).data.tags || [];
      setState({ loading: false, configured: true, settingsAvailable: status.settingsAvailable, fixedTag: status.fixedTag, tags, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.response?.data?.error || 'No se pudo consultar Chatrace.' }));
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { ...state, reload: load };
}

const STYLES = {
  // Para el modal de usuarios (siempre claro)
  light: {
    select: 'bg-white border border-slate-200 text-slate-700 focus:border-[#9AC31C]',
    input: 'bg-white border border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-[#9AC31C]',
    cancel: 'bg-slate-100 hover:bg-slate-200 text-slate-600'
  },
  // Para el Perfil (con modo oscuro)
  themed: {
    select: 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-100 focus:border-[#9AC31C]',
    input: 'bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-100 placeholder:text-slate-400 focus:border-[#9AC31C]',
    cancel: 'bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-600 dark:text-neutral-200'
  }
};

const NEW_TAG = '__new__';

/**
 * Selector de etiqueta de Chatrace: elegir una existente, quitar la etiqueta o crear una nueva.
 * `onSave(name, create)` debe devolver una promesa (lanzar si falla); aquí se muestra el estado y el error.
 * Una etiqueta guardada que ya no aparece en Chatrace se muestra marcada, para no ocultar el problema.
 */
export default function ChatraceTagPicker({ value = '', tags = [], onSave, disabled = false, variant = 'light', className = '' }) {
  const styles = STYLES[variant] || STYLES.light;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const names = tags.map((t) => t.name);
  const savedButMissing = value && !names.includes(value);

  const save = async (name, create = false) => {
    setBusy(true);
    setError('');
    try {
      await onSave(name, create);
      setCreating(false);
      setNewName('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la etiqueta.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (e) => {
    const selected = e.target.value;
    if (selected === NEW_TAG) {
      setCreating(true);
      setError('');
      return;
    }
    save(selected);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    save(name, true);
  };

  return (
    <div className={`min-w-0 ${className}`}>
      {creating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-1.5">
          <input
            autoFocus
            type="text"
            value={newName}
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre de la nueva etiqueta"
            aria-label="Nombre de la nueva etiqueta"
            disabled={busy}
            className={`min-w-0 flex-1 px-2 py-1 rounded-lg text-[11px] outline-none ${styles.input}`}
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            title="Crear la etiqueta en Chatrace y usarla"
            className="p-1.5 rounded-lg bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(''); setError(''); }}
            disabled={busy}
            title="Cancelar"
            className={`p-1.5 rounded-lg ${styles.cancel}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5">
          <select
            value={value || ''}
            onChange={handleSelect}
            disabled={disabled || busy}
            aria-label="Etiqueta de Chatrace"
            className={`min-w-0 flex-1 px-2 py-1 rounded-lg text-[11px] outline-none cursor-pointer disabled:opacity-60 ${styles.select}`}
          >
            <option value="">Sin etiqueta</option>
            {savedButMissing && <option value={value}>{value} (no encontrada en Chatrace)</option>}
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            <option value={NEW_TAG}>+ Crear nueva etiqueta…</option>
          </select>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9AC31C] shrink-0" />}
        </div>
      )}
      {error && <p role="alert" className="text-[10px] text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
