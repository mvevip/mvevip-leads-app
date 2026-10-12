import React, { useState, useRef } from 'react';
import ProgressCard from './ProgressCard';
import TimelineView from './TimelineView';
import SearchBar from './SearchBar';
import UserAvatar from './UserAvatar';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  RefreshCw, CheckCircle2, Clock, Users, ChevronDown, Check, UserCheck 
} from 'lucide-react';
import { format, isSameDay, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CalendarAgendaView({
  currentUser,
  selectedDate,
  onSelectDate,
  reminders,
  onRefresh,
  isAdmin,
  usersList = [],
  selectedUserIds = [],
  onSelectedUserIdsChange,
  onSelectReminder,
  isDualPane = false
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);

  const toggleUserSelection = (userId) => {
    if (!onSelectedUserIdsChange) return;
    if (selectedUserIds.includes(userId)) {
      if (selectedUserIds.length === 1) return; // Evitar dejar la lista vacía
      onSelectedUserIdsChange(selectedUserIds.filter(id => id !== userId));
    } else {
      onSelectedUserIdsChange([...selectedUserIds, userId]);
    }
  };

  const handleSelectOnlyMe = () => {
    if (currentUser?.id && onSelectedUserIdsChange) {
      onSelectedUserIdsChange([currentUser.id]);
    }
  };

  const handleSelectAllUsers = () => {
    if (usersList && usersList.length > 0 && onSelectedUserIdsChange) {
      onSelectedUserIdsChange(usersList.map(u => u.id));
    }
  };

  // Control de deslizamiento táctil (Swipe Gestures)
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const [slideDirection, setSlideDirection] = useState(null);

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = touchEndY - touchStartYRef.current;

    // Detectar si fue un swipe predominantemente horizontal con umbral de 50px
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        // Deslizar hacia la izquierda (<--): Día Siguiente
        setSlideDirection('slide-left');
        onSelectDate(addDays(selectedDate, 1));
        setTimeout(() => setSlideDirection(null), 250);
      } else {
        // Deslizar hacia la derecha (-->): Día Anterior
        setSlideDirection('slide-right');
        onSelectDate(subDays(selectedDate, 1));
        setTimeout(() => setSlideDirection(null), 250);
      }
    }
  };

  const goToPreviousDay = () => {
    onSelectDate(subDays(selectedDate, 1));
  };

  const goToNextDay = () => {
    onSelectDate(addDays(selectedDate, 1));
  };

  const goToToday = () => {
    onSelectDate(new Date());
  };

  // Filtrado de compromisos por fecha y estado
  const dateReminders = reminders.filter((r) => {
    const matchesDate = isSameDay(new Date(r.scheduledAt), selectedDate);
    if (!matchesDate) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchClient = r.clientName?.toLowerCase().includes(q);
      const matchTitle = r.title?.toLowerCase().includes(q);
      const matchDesc = r.description?.toLowerCase().includes(q);
      return matchClient || matchTitle || matchDesc;
    }
    return true;
  });

  const filteredReminders = dateReminders.filter((r) => {
    if (filterStatus === 'PENDING') return r.status === 'PENDING';
    return r.status === 'COMPLETED';
  });

  const pendingCount = dateReminders.filter(r => r.status === 'PENDING').length;
  const completedCount = dateReminders.filter(r => r.status === 'COMPLETED').length;

  const isToday = isSameDay(selectedDate, new Date());
  const selectedDateText = isToday 
    ? 'Hoy' 
    : format(selectedDate, "EEEE d 'de' MMMM", { locale: es });

  if (isDualPane) {
    return (
      <div className="space-y-3.5 pb-2">
        {/* Controles de Navegación de Fecha Superior */}
        <div className="py-2.5 px-3 bg-white dark:bg-neutral-800 rounded-2xl border border-slate-200/80 dark:border-neutral-700 shadow-xs flex items-center justify-between">
          <button
            onClick={goToPreviousDay}
            className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-700/60 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-200 transition-colors cursor-pointer"
            title="Día anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 text-center">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-neutral-100 capitalize leading-tight">
                {selectedDateText}
              </h2>
              <span className="text-[10px] text-slate-400 dark:text-neutral-400">
                {format(selectedDate, "yyyy")}
              </span>
            </div>

            {!isToday && (
              <button
                onClick={goToToday}
                className="px-2 py-0.5 rounded-md bg-[#9AC31C]/20 hover:bg-[#9AC31C]/30 text-[#6B8A0E] dark:text-[#9AC31C] text-[10px] font-bold transition-colors cursor-pointer"
              >
                Hoy
              </button>
            )}
          </div>

          <button
            onClick={goToNextDay}
            className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-700/60 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-200 transition-colors cursor-pointer"
            title="Día siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Selector Semanal Interactivo (ProgressCard) */}
        <ProgressCard
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />

        {/* BARRA SUPERVISIÓN MULTI-USUARIO ADMIN CON CHECKBOXES */}
        {isAdmin && (
          <div className="bg-white dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 rounded-2xl p-3 shadow-xs">
            {/* Cabecera / Trigger desplegable */}
            <div 
              onClick={() => setIsUserFilterOpen(!isUserFilterOpen)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#9AC31C]/20 text-[#6B8A0E] dark:text-[#9AC31C] flex items-center justify-center font-bold text-xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 block leading-tight">
                    {selectedUserIds.length === 1 && selectedUserIds[0] === currentUser?.id
                      ? 'Mis compromisos (Solo yo)'
                      : selectedUserIds.length === usersList?.length
                      ? 'Todos los asesores'
                      : `${selectedUserIds.length} asesores seleccionados`}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-400">
                    Toca para seleccionar calendarios con checkboxes
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]">
                  {selectedUserIds.length} {selectedUserIds.length === 1 ? 'perfil' : 'perfiles'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isUserFilterOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Panel Desplegable con Checkboxes */}
            {isUserFilterOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-neutral-700 animate-in fade-in duration-150">
                {/* Botones de acción rápida */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400">
                    Selecciona qué calendarios ver:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectOnlyMe}
                      className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-neutral-700/60 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-300 transition-colors cursor-pointer"
                    >
                      Solo yo
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllUsers}
                      className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-neutral-700/60 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-300 transition-colors cursor-pointer"
                    >
                      Todos
                    </button>
                  </div>
                </div>

                {/* Lista con Checkboxes */}
                <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar pr-0.5">
                  {usersList && usersList.map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    const isMe = u.id === currentUser?.id;
                    return (
                      <label
                        key={u.id}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleUserSelection(u.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#9AC31C]/10 border-[#9AC31C]/40 dark:bg-[#9AC31C]/15 dark:border-[#9AC31C]/50'
                            : 'bg-slate-50 dark:bg-neutral-700/40 border-slate-200/60 dark:border-neutral-700/60 hover:bg-slate-100 dark:hover:bg-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-[#9AC31C] focus:ring-0 cursor-pointer accent-[#9AC31C]"
                          />
                          <UserAvatar user={u} className="w-7 h-7 text-[10px] shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 block leading-tight truncate">
                              {u.name} {isMe && <span className="text-[#6B8A0E] dark:text-[#9AC31C] font-black">(Tú)</span>}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-neutral-400 leading-tight block">
                              {u.role === 'ADMIN' ? 'Administrador' : 'Asesor'}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <Check className="w-4 h-4 text-[#6B8A0E] dark:text-[#9AC31C] shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barra de Búsqueda */}
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {/* Switch de Filtro: Pendientes vs Terminados */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-400">
              Compromisos ({filteredReminders.length})
            </h3>
            <button
              onClick={() => onRefresh()}
              className="text-xs font-semibold text-slate-400 dark:text-neutral-400 hover:text-slate-600 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Actualizar
            </button>
          </div>

          <div className="flex bg-slate-200/80 dark:bg-neutral-800 p-1 rounded-xl mb-3 text-xs font-bold shadow-inner">
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                filterStatus === 'PENDING'
                  ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 shadow-xs'
                  : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Pendientes ({pendingCount})
            </button>

            <button
              onClick={() => setFilterStatus('COMPLETED')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                filterStatus === 'COMPLETED'
                  ? 'bg-white dark:bg-neutral-900 text-[#6B8A0E] dark:text-[#9AC31C] shadow-xs'
                  : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#9AC31C]" />
              Realizados ({completedCount})
            </button>
          </div>

          {/* Vista Timeline */}
          <TimelineView
            selectedDate={selectedDate}
            reminders={filteredReminders}
            onSelectReminder={onSelectReminder}
          />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="pb-6 transition-all duration-200"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-6">
        {/* Columna Izquierda en Desktop / Superior en Móvil */}
        <div className="md:col-span-5 lg:col-span-4 space-y-3">
          {/* Controles de Navegación de Fecha Superior */}
          <div className="py-2.5 px-3 bg-white dark:bg-neutral-850 rounded-2xl border border-slate-200/80 dark:border-neutral-800 shadow-xs flex items-center justify-between mb-3">
        <button
          onClick={goToPreviousDay}
          className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-200 transition-colors cursor-pointer"
          title="Día anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-center">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-neutral-100 capitalize leading-tight">
              {selectedDateText}
            </h2>
            <span className="text-[10px] text-slate-400 dark:text-neutral-400">
              {format(selectedDate, "yyyy")} • Desliza ⟵ ⟶ para navegar
            </span>
          </div>

          {!isToday && (
            <button
              onClick={goToToday}
              className="px-2 py-0.5 rounded-md bg-[#9AC31C]/20 hover:bg-[#9AC31C]/30 text-[#6B8A0E] dark:text-[#9AC31C] text-[10px] font-bold transition-colors"
            >
              Hoy
            </button>
          )}
        </div>

        <button
          onClick={goToNextDay}
          className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-200 transition-colors cursor-pointer"
          title="Día siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de Búsqueda */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* BARRA SUPERVISIÓN MULTI-USUARIO ADMIN CON CHECKBOXES */}
      {isAdmin && (
        <div className="my-2.5 bg-white dark:bg-neutral-850 border border-slate-200/80 dark:border-neutral-800 rounded-2xl p-3 shadow-xs">
          {/* Cabecera / Trigger desplegable */}
          <div 
            onClick={() => setIsUserFilterOpen(!isUserFilterOpen)}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#9AC31C]/20 text-[#6B8A0E] dark:text-[#9AC31C] flex items-center justify-center font-bold text-xs">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 block leading-tight">
                  {selectedUserIds.length === 1 && selectedUserIds[0] === currentUser?.id
                    ? 'Mis compromisos (Solo yo)'
                    : selectedUserIds.length === usersList?.length
                    ? 'Todos los asesores'
                    : `${selectedUserIds.length} asesores seleccionados`}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-neutral-400">
                  Toca para seleccionar calendarios con checkboxes
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C]">
                {selectedUserIds.length} {selectedUserIds.length === 1 ? 'perfil' : 'perfiles'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isUserFilterOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Panel Desplegable con Checkboxes */}
          {isUserFilterOpen && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-neutral-800 animate-in fade-in duration-150">
              {/* Botones de acción rápida */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400">
                  Selecciona qué calendarios ver:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectOnlyMe}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-neutral-800 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-300 transition-colors cursor-pointer"
                  >
                    Solo yo
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllUsers}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-neutral-800 hover:bg-[#9AC31C]/20 text-slate-700 dark:text-neutral-300 transition-colors cursor-pointer"
                  >
                    Todos
                  </button>
                </div>
              </div>

              {/* Lista con Checkboxes */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar pr-0.5">
                {usersList && usersList.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  const isMe = u.id === currentUser?.id;
                  return (
                    <label
                      key={u.id}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleUserSelection(u.id);
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#9AC31C]/10 border-[#9AC31C]/40 dark:bg-[#9AC31C]/15 dark:border-[#9AC31C]/50'
                          : 'bg-slate-50 dark:bg-neutral-800/50 border-slate-200/60 dark:border-neutral-700/60 hover:bg-slate-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-[#9AC31C] focus:ring-0 cursor-pointer accent-[#9AC31C]"
                        />
                        <UserAvatar user={u} className="w-7 h-7 text-[10px] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 block leading-tight truncate">
                            {u.name} {isMe && <span className="text-[#6B8A0E] dark:text-[#9AC31C] font-black">(Tú)</span>}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-neutral-400 leading-tight block">
                            {u.role === 'ADMIN' ? 'Administrador' : 'Asesor'}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-[#6B8A0E] dark:text-[#9AC31C] shrink-0" />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selector Semanal Interactivo (ProgressCard) */}
      <div className="mt-2.5">
        <ProgressCard
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      </div>
    </div>

    {/* Columna Derecha en Desktop / Inferior en Móvil */}
    <div className="md:col-span-7 lg:col-span-8 mt-4 md:mt-0">
      {/* Switch de Filtro: Pendientes vs Terminados */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-400">
            Compromisos ({filteredReminders.length})
          </h3>
          <button
            onClick={() => onRefresh()}
            className="text-xs font-semibold text-slate-400 dark:text-neutral-400 hover:text-slate-600 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Actualizar
          </button>
        </div>

        <div className="flex bg-slate-200/80 dark:bg-neutral-800 p-1 rounded-xl mb-3 text-xs font-bold shadow-inner">
          <button
            onClick={() => setFilterStatus('PENDING')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              filterStatus === 'PENDING'
                ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 shadow-xs'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Pendientes ({pendingCount})
          </button>

          <button
            onClick={() => setFilterStatus('COMPLETED')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              filterStatus === 'COMPLETED'
                ? 'bg-white dark:bg-neutral-900 text-[#6B8A0E] dark:text-[#9AC31C] shadow-xs'
                : 'text-slate-500 dark:text-neutral-400 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#9AC31C]" />
            Realizados ({completedCount})
          </button>
        </div>

        {/* Vista Timeline con animación de Swipe */}
        <div className={`transition-transform duration-200 ${
          slideDirection === 'slide-left' ? '-translate-x-2 opacity-80' :
          slideDirection === 'slide-right' ? 'translate-x-2 opacity-80' : 'translate-x-0 opacity-100'
        }`}>
          <TimelineView
            selectedDate={selectedDate}
            reminders={filteredReminders}
            onSelectReminder={onSelectReminder}
          />
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
