import React from 'react';
import { Sparkles, Calendar, Bell, User } from 'lucide-react';

export default function BottomNav({ activeTab, onTabChange, unreadCount = 0 }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto px-4 pb-3 pointer-events-none">
      <nav className="relative bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-3xl h-16 px-4 flex items-center justify-around bottom-nav-shadow border border-slate-200/80 dark:border-neutral-800 pointer-events-auto">
        
        {/* Tab 1: Asistente IA Comercial (Home) */}
        <button
          onClick={() => onTabChange('home')}
          className={`flex-1 flex flex-col items-center justify-center transition-all ${
            activeTab === 'home' 
              ? 'text-[#6B8A0E] dark:text-[#9AC31C] font-extrabold scale-105' 
              : 'text-slate-400 dark:text-neutral-500 hover:text-slate-600'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${
            activeTab === 'home' ? 'bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]' : ''
          }`}>
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
          </div>
          <span className="text-[10px] mt-0.5">Asistente</span>
        </button>

        {/* Tab 2: Agenda & Calendario */}
        <button
          onClick={() => onTabChange('calendar')}
          className={`flex-1 flex flex-col items-center justify-center transition-all ${
            activeTab === 'calendar' 
              ? 'text-[#6B8A0E] dark:text-[#9AC31C] font-extrabold scale-105' 
              : 'text-slate-400 dark:text-neutral-500 hover:text-slate-600'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${
            activeTab === 'calendar' ? 'bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]' : ''
          }`}>
            <Calendar className="w-5 h-5 stroke-[2.2]" />
          </div>
          <span className="text-[10px] mt-0.5">Agenda</span>
        </button>

        {/* Tab 3: Alertas Push */}
        <button
          onClick={() => onTabChange('alerts')}
          className={`flex-1 relative flex flex-col items-center justify-center transition-all ${
            activeTab === 'alerts' 
              ? 'text-[#6B8A0E] dark:text-[#9AC31C] font-extrabold scale-105' 
              : 'text-slate-400 dark:text-neutral-500 hover:text-slate-600'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${
            activeTab === 'alerts' ? 'bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]' : ''
          }`}>
            <Bell className="w-5 h-5 stroke-[2.2]" />
          </div>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-6 w-2 h-2 bg-pink-500 rounded-full ring-2 ring-white dark:ring-neutral-900" />
          )}
          <span className="text-[10px] mt-0.5">Alertas</span>
        </button>

        {/* Tab 4: Perfil & Ajustes */}
        <button
          onClick={() => onTabChange('profile')}
          className={`flex-1 flex flex-col items-center justify-center transition-all ${
            activeTab === 'profile' 
              ? 'text-[#6B8A0E] dark:text-[#9AC31C] font-extrabold scale-105' 
              : 'text-slate-400 dark:text-neutral-500 hover:text-slate-600'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${
            activeTab === 'profile' ? 'bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]' : ''
          }`}>
            <User className="w-5 h-5 stroke-[2.2]" />
          </div>
          <span className="text-[10px] mt-0.5">Perfil</span>
        </button>

      </nav>
    </div>
  );
}
