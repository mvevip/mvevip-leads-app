import React from 'react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreHorizontal } from 'lucide-react';

export default function TimelineView({ selectedDate = new Date(), reminders = [], onSelectReminder }) {
  // Agenda de 5 AM hasta la medianoche (la última franja es 11 PM)
  const FIRST_HOUR = 5;
  const LAST_HOUR = 23;
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

  const safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
  const now = new Date();
  const isToday = isSameDay(safeDate, now);
  const currentTimeString = format(now, 'h:mm a');

  const dayReminders = (reminders || []).filter(r => {
    try {
      return isSameDay(new Date(r.scheduledAt), safeDate);
    } catch {
      return false;
    }
  });

  // Compromisos entre las 12 AM y las 5 AM: no tienen franja horaria, se listan aparte para que nunca queden ocultos
  const outOfHoursReminders = dayReminders
    .filter((rem) => {
      const remHour = new Date(rem.scheduledAt).getHours();
      return remHour < FIRST_HOUR || remHour > LAST_HOUR;
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const showOutOfHours = outOfHoursReminders.length > 0 || (isToday && now.getHours() < FIRST_HOUR);

  const borderColors = {
    URGENT: 'border-l-rose-500',
    HIGH: 'border-l-amber-500',
    MEDIUM: 'border-l-[#9AC31C]',
    LOW: 'border-l-blue-400'
  };

  const renderReminderCard = (reminder) => {
    const startTime = format(new Date(reminder.scheduledAt), 'h:mm a');
    return (
      <div
        key={reminder.id}
        onClick={() => onSelectReminder(reminder)}
        className={`bg-white dark:bg-neutral-850 rounded-2xl p-3.5 mb-2 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.04)] border border-slate-100/90 dark:border-neutral-700/60 border-l-4 ${
          borderColors[reminder.priority] || 'border-l-[#9AC31C]'
        } cursor-pointer active:scale-[0.98] transition-transform`}
      >
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-bold text-slate-800 dark:text-neutral-100 text-sm leading-tight">
              {reminder.title}
            </h4>
            <span className="text-[11px] text-slate-400 dark:text-neutral-400 font-medium block mt-0.5">
              {startTime} • {reminder.clientName}
            </span>
            {reminder.assigned?.name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-neutral-400 font-medium mt-1 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md">
                Asesor: <strong className="text-slate-700 dark:text-neutral-200">{reminder.assigned.name}</strong>
              </span>
            )}
          </div>
          <button className="text-slate-300 dark:text-neutral-500 hover:text-slate-500">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {reminder.description && (
          <p className="text-xs text-slate-500 dark:text-neutral-300 mt-2 line-clamp-1">
            {reminder.description}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          {/* Tags */}
          <div className="flex gap-1">
            {reminder.tags?.map(({ tag }) => (
              <span
                key={tag.id}
                className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${tag.colorHex}20`, color: tag.colorHex }}
              >
                {tag.name}
              </span>
            ))}
          </div>

          {/* Estado */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            reminder.status === 'COMPLETED' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' :
            reminder.status === 'DISMISSED' ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400' :
            'bg-[#9AC31C]/15 dark:bg-[#9AC31C]/25 text-[#739412] dark:text-[#B7E22F]'
          }`}>
            {reminder.status === 'COMPLETED' ? 'Completado' :
             reminder.status === 'DISMISSED' ? 'Dado de Baja' : 'Pendiente'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="relative pb-24 pt-2">
      {/* Encabezado de fecha */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100 capitalize">
          {format(safeDate, "EEEE, d 'de' MMMM yyyy", { locale: es })}
        </h2>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-slate-400 dark:text-neutral-500">Agenda de 5 AM a 12 AM (Quito, UTC-5)</p>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-neutral-900 dark:text-neutral-950 bg-[#9AC31C]/30 dark:bg-[#9AC31C] px-2 py-0.5 rounded-full">
            {dayReminders.length} {dayReminders.length === 1 ? 'compromiso' : 'compromisos'}
          </span>
        </div>
      </div>

      {/* Fuera de horario: de 12 AM a 5 AM */}
      {showOutOfHours && (
        <div className="relative min-h-[60px] border-t border-slate-100 dark:border-neutral-800/80 flex">
          <div className="w-14 pt-1 pr-3 text-right">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-neutral-500 leading-tight block">12–5 AM</span>
          </div>
          <div className="flex-1 pl-3 pb-3">
            <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 mb-1.5">Fuera de horario</p>
            {isToday && now.getHours() < FIRST_HOUR && (
              <div className="relative my-1.5 flex items-center">
                <span className="bg-[#9AC31C] text-neutral-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full z-10 shadow-xs">
                  {currentTimeString}
                </span>
                <div className="h-0.5 bg-[#9AC31C] flex-1 ml-1 rounded-full"></div>
              </div>
            )}
            {outOfHoursReminders.map((reminder) => renderReminderCard(reminder))}
          </div>
        </div>
      )}

      <div className="relative">
        {hours.map((hour) => {
          const matchingReminders = dayReminders.filter((rem) => {
            const remHour = new Date(rem.scheduledAt).getHours();
            return remHour === hour;
          });

          const isCurrentHourSlot = isToday && now.getHours() === hour;

          return (
            <div key={hour} className="relative min-h-[85px] border-t border-slate-100 dark:border-neutral-800/80 flex">
              {/* Etiqueta de la hora */}
              <div className="w-14 pt-1 pr-3 text-right">
                <span className="text-xs font-semibold text-slate-400 dark:text-neutral-500">
                  {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                </span>
              </div>

              {/* Contenido / Tarjetas de eventos */}
              <div className="flex-1 pl-3 pb-3">
                {/* Marcador de tiempo actual con #9AC31C */}
                {isCurrentHourSlot && (
                  <div className="relative my-1.5 flex items-center">
                    <span className="bg-[#9AC31C] text-neutral-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full z-10 shadow-xs">
                      {currentTimeString}
                    </span>
                    <div className="h-0.5 bg-[#9AC31C] flex-1 ml-1 rounded-full"></div>
                  </div>
                )}

                {matchingReminders.map((reminder) => renderReminderCard(reminder))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
