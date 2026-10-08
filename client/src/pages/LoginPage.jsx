import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Lock, Mail, Loader2, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const res = await login(email, password);
    if (!res.success) {
      setErrorMsg(res.error || 'Credenciales inválidas');
    }
    setLoading(false);
  };

  const handleQuickLogin = (roleEmail) => {
    setEmail(roleEmail);
    setPassword('mvevip12345');
  };

  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-neutral-50 via-white to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 transition-colors">
      <div className="w-full max-w-sm bg-white dark:bg-neutral-850 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-neutral-700">
        
        {/* Logo / Encabezado */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#9AC31C]/20 border border-[#9AC31C]/40 rounded-2xl mx-auto flex items-center justify-center text-[#9AC31C] shadow-lg shadow-[#9AC31C]/15 mb-3">
            <Sparkles className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-neutral-100 tracking-tight">MVEVIP Leads</h2>
          <p className="text-xs text-slate-400 dark:text-neutral-400 mt-1">Gestión y Recordatorios de Chatrace</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 rounded-xl text-xs text-rose-600 dark:text-rose-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-300 mb-1">Correo Electrónico</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu.correo@mvevip.com"
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#9AC31C]/30 focus:border-[#9AC31C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-300 mb-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#9AC31C]/30 focus:border-[#9AC31C]"
              />
            </div>
            <span className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1 block">Sesión válida por 5 días continuos.</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-[#9AC31C]/25 active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 stroke-[2.5]" />}
            <span>Ingresar a la Plataforma</span>
          </button>
        </form>

        {/* Acceso rápido de demostración solo visible en localhost */}
        {isLocalhost && (
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-neutral-750 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-2">
              Accesos Locales de Prueba
            </span>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@marketingvip.com')}
                className="px-2.5 py-1 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-neutral-300"
              >
                Demo Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('carlos.asesor@marketingvip.com')}
                className="px-2.5 py-1 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-neutral-300"
              >
                Demo Asesor
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
