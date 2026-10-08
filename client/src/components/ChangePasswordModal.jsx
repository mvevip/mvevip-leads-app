import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { KeyRound, Lock, Check, Loader2, ShieldAlert } from 'lucide-react';

export default function ChangePasswordModal({ isOpen }) {
  const { user, updateCurrentUser, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/change-password', { newPassword });
      updateCurrentUser({
        mustChangePassword: false,
        isFirstLogin: res.data.user?.isFirstLogin !== undefined ? res.data.user.isFirstLogin : user?.isFirstLogin
      });
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error actualizando contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-850 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-neutral-700 animate-in fade-in zoom-in-95">
        
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-[#9AC31C]/20 text-[#678211] dark:text-[#9AC31C] rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-neutral-100">Actualizar Contraseña</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 leading-relaxed">
            Por seguridad, como tu cuenta es nueva o ha sido reseteada, debes ingresar tu nueva clave personal.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 rounded-xl text-xs text-rose-600 dark:text-rose-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">Nueva Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-400 dark:text-neutral-500" />
              </div>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#9AC31C]/30 focus:border-[#9AC31C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">Confirmar Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-400 dark:text-neutral-500" />
              </div>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#9AC31C]/30 focus:border-[#9AC31C]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-[#9AC31C]/20 active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Guardar Nueva Contraseña</span>
          </button>
        </form>

        <button
          onClick={logout}
          className="w-full mt-3 py-2 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 text-center block"
        >
          Cerrar Sesión
        </button>

      </div>
    </div>
  );
}
