import React from 'react';
import DayPicker from './DayPicker';

export default function ProgressCard({ selectedDate, onSelectDate }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-neutral-800 bg-gradient-to-r from-slate-100/90 via-slate-50 to-[#9AC31C]/10 dark:from-neutral-850 dark:via-neutral-900 dark:to-[#9AC31C]/15">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 tracking-tight">
          Agenda Semanal
        </span>
        <span className="text-[10px] text-slate-400 dark:text-neutral-400 font-medium">
          Selecciona un día
        </span>
      </div>

      {/* Selector de días compacto */}
      <DayPicker selectedDate={selectedDate} onSelectDate={onSelectDate} />
    </div>
  );
}
