import React from 'react';
import { MoreHorizontal } from 'lucide-react';

export default function ProjectCard({ title, dateInfo, taskCount, borderAccent = "border-l-indigo-500", avatars = [] }) {
  return (
    <div className={`min-w-[210px] bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.03)] border border-slate-100/80 dark:border-neutral-700 flex flex-col justify-between border-l-4 ${borderAccent}`}>
      <div className="flex justify-between items-start">
        <h4 className="font-bold text-slate-800 dark:text-neutral-100 text-sm leading-snug max-w-[140px] line-clamp-2">
          {title}
        </h4>
        <button className="text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {/* Avatares solapados */}
        <div className="flex -space-x-2 overflow-hidden">
          {avatars.length > 0 ? (
            avatars.slice(0, 3).map((url, i) => (
              <img
                key={i}
                className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-neutral-800 object-cover"
                src={url}
                alt="Avatar"
              />
            ))
          ) : (
            <div className="h-6 w-6 rounded-full bg-neutral-800 text-[#9AC31C] text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-neutral-800">
              MV
            </div>
          )}
        </div>

        {/* Metadatos de tareas y fecha */}
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-medium block">
            {dateInfo || '25.10(11pm)'}
          </span>
          <span className="text-[10px] text-slate-500 font-semibold block">
            {taskCount || '7 Tasks'}
          </span>
        </div>
      </div>
    </div>
  );
}
