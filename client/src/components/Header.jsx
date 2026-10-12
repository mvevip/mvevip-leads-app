import React from 'react';
import { Settings, Moon, Sun, Sparkles, Calendar, Bell, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import UserAvatar from './UserAvatar';

export default function Header({ user, onOpenSettings, activeTab, onTabChange, unreadCount = 0 }) {
  const { isDark, toggleTheme } = useTheme();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const navItems = [
    { id: 'home', label: 'Asistente IA', icon: Sparkles },
    { id: 'calendar', label: 'Agenda', icon: Calendar },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'Perfil', icon: User }
  ];

  return (
    <header className="flex items-center justify-between pt-1 pb-1.5 w-full">
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

      {/* Navegación Desktop / Tablet (Visible en md:) */}
      {onTabChange && (
        <nav className="hidden md:flex items-center gap-1 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 dark:border-neutral-700 shadow-xs">
          {navItems.map((item) => {
            const Icon = item.icon;
            // En desktop lg:, 'home' y 'calendar' están unificados
            const isActive = (item.id === 'home' || item.id === 'calendar')
              ? (activeTab === 'home' || activeTab === 'calendar')
              : activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  item.id === 'calendar' ? 'hidden md:flex lg:hidden' : ''
                } ${
                  isActive
                    ? 'bg-[#9AC31C] text-neutral-950 shadow-xs'
                    : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                {item.id === 'home' ? (
                  <>
                    <span className="lg:hidden">Asistente IA</span>
                    <span className="hidden lg:inline">Agenda & Asistente IA</span>
                  </>
                ) : (
                  <span>{item.label}</span>
                )}
                {item.badge > 0 && (
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-neutral-950' : 'bg-pink-500'}`} />
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Botones de Cabecera (Toggle Tema rápido y Ajustes) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full bg-white dark:bg-neutral-800 border border-slate-100 dark:border-neutral-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-neutral-200 active:scale-95 hover:bg-slate-50 dark:hover:bg-neutral-750 transition-all"
          title={isDark ? "Cambiar a modo Claro" : "Cambiar a modo Noche"}
        >
          {isDark ? <Sun className="w-4 h-4 text-[#9AC31C]" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full bg-white dark:bg-neutral-800 border border-slate-100 dark:border-neutral-700 shadow-xs flex items-center justify-center text-slate-600 dark:text-neutral-200 active:scale-95 hover:bg-slate-50 dark:hover:bg-neutral-750 transition-all"
          aria-label="Configuración"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

