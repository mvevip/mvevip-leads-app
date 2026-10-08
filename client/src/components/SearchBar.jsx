import React from 'react';
import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange, placeholder = "Buscar lead o recordatorio..." }) {
  return (
    <div className="relative my-3">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-800/90 border border-slate-100 dark:border-neutral-700/80 rounded-2xl text-sm placeholder-slate-400 dark:placeholder-neutral-500 text-slate-800 dark:text-neutral-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#9AC31C]/30 focus:border-[#9AC31C] transition-all"
      />
    </div>
  );
}
