import React from 'react';
import { Settings, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import UserAvatar from './UserAvatar';

export default function Header({ user, onOpenSettings }) {
  const { isDark, toggleTheme } = useTheme();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <header className="flex items-center justify-between pt-1 pb-1.5">
      {/* Perfil & Saludo */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <UserAvatar
          user={user}
          className="w-10 h-10 text-xs shadow-xs shrink-0"
          showBadge={true}
          badgeText="+"
        />
        <div className="min-w-0">
          <span className="text-[11px] text-slate-400 dark:text-neutral-400 font-medium block leading-tight truncate">
            {greeting}
          </span>
          <h1 className="text-base font-bold text-slate-900 dark:text-neutral-100 tracking-tight leading-tight truncate">
            {user?.name || "Asesor"}
          </h1>
        </div>
      </div>

      {/* Botones de Cabecera (Toggle Tema rápido y Ajustes) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full bg-white dark:bg-neutral-800 border border-slate-100 dark:border-neutral-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-neutral-200 active:scale-95 transition-transform"
          title={isDark ? "Cambiar a modo Claro" : "Cambiar a modo Noche"}
        >
          {isDark ? <Sun className="w-4 h-4 text-[#9AC31C]" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full bg-white dark:bg-neutral-800 border border-slate-100 dark:border-neutral-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-neutral-200 active:scale-95 transition-transform"
          aria-label="Configuración"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
