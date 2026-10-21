import React from 'react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DayPicker({ selectedDate, onSelectDate }) {
  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  // Semana completa de lunes a domingo
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(offset => addDays(startDate, offset));

  return (
    <div className="flex items-center justify-between gap-1 my-1">
      {weekDays.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const dayName = format(day, 'EEE', { locale: es }).substring(0, 3);
        const dayNumber = format(day, 'd');

        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelectDate(day)}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-2 px-0.5 rounded-xl transition-all duration-200 active:scale-95 ${
              isSelected
                ? 'bg-[#9AC31C] text-neutral-950 font-bold shadow-[0_4px_12px_rgba(154,195,28,0.35)]'
                : 'bg-white/95 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-700 shadow-xs'
            }`}
          >
            <span className={`text-[10px] font-semibold capitalize ${isSelected ? 'text-neutral-900' : 'text-slate-400 dark:text-neutral-400'}`}>
              {dayName}
            </span>
            <span className={`text-sm font-extrabold mt-0.5 ${isSelected ? 'text-neutral-950' : 'text-slate-800 dark:text-neutral-100'}`}>
              {dayNumber}
            </span>
          </button>
        );
      })}
    </div>
  );
}
