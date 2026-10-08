import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useUpdate } from '../context/UpdateContext';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import AssistantChatView from '../components/AssistantChatView';
import CalendarAgendaView from '../components/CalendarAgendaView';
import ReminderDetailModal from '../components/ReminderDetailModal';
import AdminUserManagementModal from '../components/AdminUserManagementModal';
import UserAvatar from '../components/UserAvatar';
import { registerPushNotifications, triggerTestPush } from '../services/pushService';
import api from '../services/api';
import { isSameDay, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, LogOut, Shield, RefreshCw, Calendar as CalendarIcon, Clock, CheckCircle2, Users, Sun, Moon, Camera, Trash2, Loader2, Sparkles } from 'lucide-react';

export default function HomePage() {
  const { user, logout, isAdmin, updateCurrentUser } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const { currentVersion, checkForUpdate, openUpdateModal } = useUpdate();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [reminders, setReminders] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [isAdminUsersModalOpen, setIsAdminUsersModalOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window && Notification.permission === 'granted') {
        return 'active';
      }
      if (localStorage.getItem('mvevip_push_active') === 'true') {
        return 'active';
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  // Filtro multi-usuario para ADMIN en Agenda (por defecto SOLO el usuario actual)
  const [selectedUserIds, setSelectedUserIds] = useState(() => (user?.id ? [user.id] : []));

  useEffect(() => {
    if (user?.id && (!selectedUserIds || selectedUserIds.length === 0)) {
      setSelectedUserIds([user.id]);
    }
  }, [user?.id]);

  // Switch de estado: 'PENDING' (por defecto) o 'COMPLETED'
  const [filterStatus, setFilterStatus] = useState('PENDING');

  // Gestión de foto de perfil
  const profileFileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const handleProfilePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('La imagen debe pesar menos de 5MB');
      return;
    }
    setUploadingPhoto(true);
    setPhotoError('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result;
        await api.post('/auth/avatar', { avatarUrl: base64 });
        updateCurrentUser({ avatarUrl: base64, isFirstLogin: false });
      } catch (err) {
        setPhotoError(err.response?.data?.error || 'Error al subir foto');
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfilePhoto = async () => {
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      await api.post('/auth/avatar', { avatarUrl: null });
      updateCurrentUser({ avatarUrl: null });
    } catch (err) {
      setPhotoError('Error al quitar foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Cargar recordatorios de la API
  const fetchReminders = async () => {
    try {
      const params = {
        search: searchQuery || undefined
      };
      if (isAdmin && selectedUserIds.length > 0) {
        params.assignedIds = selectedUserIds.join(',');
      }
      const res = await api.get('/reminders', { params });
      setReminders(res.data);
    } catch (err) {
      console.error('Error cargando recordatorios:', err);
    }
  };

  // Cargar usuarios para transferencias o administración
  const fetchUsers = async () => {
    if (isAdmin) {
      try {
        const res = await api.get('/admin/users');
        setUsersList(res.data);
      } catch (err) {
        console.error('Error cargando usuarios:', err);
      }
    }
  };

  useEffect(() => {
    fetchReminders();
    fetchUsers();
  }, [searchQuery, isAdmin, selectedUserIds]);

  // Verificar y persistir suscripción y permisos push existentes al montar
  useEffect(() => {
    const checkNotificationStatus = async () => {
      if (typeof window === 'undefined') return;
      if ('Notification' in window && Notification.permission === 'granted') {
        setPushStatus('active');
        localStorage.setItem('mvevip_push_active', 'true');
        return;
      }
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            setPushStatus('active');
            localStorage.setItem('mvevip_push_active', 'true');
          }
        } catch (e) {
          // ignore
        }
      }
    };
    checkNotificationStatus();
  }, []);

  // Manejar activación de Notificaciones Push
  const handleEnablePush = async () => {
    setLoading(true);
    const res = await registerPushNotifications();
    if (res.success) {
      setPushStatus('active');
      localStorage.setItem('mvevip_push_active', 'true');
      await triggerTestPush();
      alert('¡Notificaciones Push activadas con éxito! Hemos enviado una alerta de prueba a tu dispositivo.');
    } else {
      setPushStatus('error');
      alert('No se pudo activar Push: ' + (res.reason || res.error || 'Revisa permisos en el navegador'));
    }
    setLoading(false);
  };

  // Filtrado por fecha y por estado
  const dateReminders = reminders.filter((r) => {
    return isSameDay(new Date(r.scheduledAt), selectedDate);
  });

  const filteredReminders = dateReminders.filter((r) => {
    if (filterStatus === 'PENDING') {
      return r.status === 'PENDING';
    }
    return r.status === 'COMPLETED';
  });

  const pendingCount = dateReminders.filter(r => r.status === 'PENDING').length;
  const completedCount = dateReminders.filter(r => r.status === 'COMPLETED').length;

  const isToday = isSameDay(selectedDate, new Date());
  const selectedDateText = isToday 
    ? 'Hoy' 
    : format(selectedDate, "EEEE d 'de' MMMM", { locale: es });

  return (
    <div
      className={
        activeTab === 'home'
          ? "fixed inset-0 flex flex-col overflow-hidden bg-[#F8FAFC] dark:bg-[#121212] text-slate-800 dark:text-neutral-100 transition-colors duration-200"
          : "min-h-screen bg-[#F8FAFC] dark:bg-[#121212] pb-24 text-slate-800 dark:text-neutral-100 transition-colors duration-200 overflow-y-auto"
      }
    >
      {activeTab === 'home' ? (
        <>
          {/* Cabecera Principal FIJA (Avatar, Nombre y Acciones) */}
          <div className="shrink-0 w-full max-w-md mx-auto px-4 safe-top pb-1 bg-[#F8FAFC]/95 dark:bg-[#121212]/95 backdrop-blur-md z-20">
            <Header user={user} onOpenSettings={() => setActiveTab('profile')} />
          </div>

          {/* PESTAÑA INICIO: ASISTENTE COMERCIAL IA PERMANENTE */}
          <div className="flex-1 min-h-0 w-full max-w-md mx-auto px-4 flex flex-col overflow-hidden">
            <AssistantChatView
              user={user}
              onReminderUpdated={fetchReminders}
            />
          </div>
        </>
      ) : (
        <div className="max-w-md mx-auto px-5 safe-top">
          {/* Cabecera Principal */}
          <Header user={user} onOpenSettings={() => setActiveTab('profile')} />

          {/* PESTAÑA AGENDA: CALENDARIO CON SWIPE Y GESTIÓN DE COMPROMISOS */}
          {activeTab === 'calendar' && (
            <CalendarAgendaView
              currentUser={user}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              reminders={reminders}
              onRefresh={fetchReminders}
              isAdmin={isAdmin}
              usersList={usersList}
              selectedUserIds={selectedUserIds}
              onSelectedUserIdsChange={setSelectedUserIds}
              onSelectReminder={setSelectedReminder}
            />
        )}

        {/* PESTAÑA PERFIL Y AJUSTES */}
        {activeTab === 'profile' && (
          <div className="py-4 space-y-4">
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 border border-slate-100 dark:border-neutral-700 shadow-xs text-center">
              <div className="relative inline-block mx-auto mb-2">
                <UserAvatar user={user} className="w-20 h-20 text-2xl" />
                <button
                  type="button"
                  onClick={() => profileFileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 w-7 h-7 bg-[#9AC31C] text-neutral-950 rounded-full flex items-center justify-center shadow-md hover:bg-[#86AB17] active:scale-95 transition-all"
                  title="Cambiar foto de perfil"
                >
                  <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              <input
                type="file"
                accept="image/*"
                ref={profileFileInputRef}
                onChange={handleProfilePhotoChange}
                className="hidden"
              />

              {photoError && (
                <p className="text-xs text-rose-500 my-1">{photoError}</p>
              )}

              <h3 className="text-base font-extrabold text-slate-800 dark:text-neutral-100 mt-1">{user?.name}</h3>
              <span className="inline-block px-2.5 py-0.5 bg-[#9AC31C]/20 text-[#6B8A0E] dark:text-[#9AC31C] font-bold rounded-full text-[10px] mt-1">
                {user?.role === 'ADMIN' ? 'Administrador' : 'Asesor Comercial'}
              </span>
              <p className="text-xs text-slate-400 dark:text-neutral-400 mt-1">{user?.email}</p>

              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => profileFileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="px-3 py-1.5 bg-[#9AC31C]/15 hover:bg-[#9AC31C]/25 text-[#6B8A0E] dark:text-[#9AC31C] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{uploadingPhoto ? 'Guardando...' : (user?.avatarUrl && !user.avatarUrl.includes('unsplash') ? 'Cambiar Foto' : 'Subir Foto')}</span>
                </button>

                {user?.avatarUrl && !user.avatarUrl.includes('unsplash') && (
                  <button
                    type="button"
                    onClick={handleRemoveProfilePhoto}
                    disabled={uploadingPhoto}
                    className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Quitar Foto</span>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 border border-slate-100 dark:border-neutral-700 shadow-xs space-y-2">
              
              {/* SWITCH DE APARIENCIA LIGHT / NIGHT */}
              <div className="p-3 bg-slate-50 dark:bg-neutral-750 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {isDark ? <Moon className="w-5 h-5 text-[#9AC31C]" /> : <Sun className="w-5 h-5 text-amber-500" />}
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-neutral-100 block">Modo Noche / Claro</span>
                    <span className="text-[10px] text-slate-400 dark:text-neutral-400">
                      {isDark ? 'Tema oscuro activo' : 'Tema claro activo'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={toggleTheme}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
                    isDark ? 'bg-[#9AC31C] justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform"></div>
                </button>
              </div>

              <button
                onClick={handleEnablePush}
                className="w-full py-2.5 px-4 bg-slate-50 dark:bg-neutral-750 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-neutral-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2"><Bell className="w-4 h-4 text-[#9AC31C]" /> Notificaciones Push ({pushStatus === 'active' ? 'Activas' : 'Inactivas'})</span>
                <span className="text-[#9AC31C] font-bold">Probar</span>
              </button>

              {/* INFORMACIÓN DE VERSIÓN Y ACTUALIZADOR PWA */}
              <div className="w-full py-2.5 px-4 bg-slate-50 dark:bg-neutral-750 rounded-xl text-xs font-semibold text-slate-700 dark:text-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#9AC31C]" />
                  <div>
                    <span className="block font-bold">Versión de la App</span>
                    <span className="text-[10px] text-slate-400 dark:text-neutral-400 font-normal">v{currentVersion} (PWA lista)</span>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const hasUpdate = await checkForUpdate(true);
                    if (!hasUpdate) {
                      openUpdateModal();
                    }
                  }}
                  className="px-2.5 py-1 bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 font-black text-[11px] rounded-lg transition-all"
                >
                  Buscar / Probar
                </button>
              </div>

              {isAdmin && (
                <button
                  onClick={() => setIsAdminUsersModalOpen(true)}
                  className="w-full py-2.5 px-4 bg-slate-50 dark:bg-neutral-750 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-neutral-200 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#9AC31C]" /> Gestionar Usuarios & Asesores</span>
                  <span className="font-bold text-[#9AC31C]">&gt;</span>
                </button>
              )}

              <button
                onClick={logout}
                className="w-full py-2.5 px-4 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2"><LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Cerrar Sesión</span>
                <span className="text-[10px] text-rose-400">JWT (5 días)</span>
              </button>
            </div>
          </div>
        )}

        {/* PESTAÑA ALERTAS */}
        {activeTab === 'alerts' && (
          <div className="py-4">
            <h3 className="font-extrabold text-slate-900 dark:text-neutral-100 text-base mb-3">Historial de Notificaciones</h3>
            <div className="space-y-2">
              {reminders.filter(r => r.notificationSent).length > 0 ? (
                reminders.filter(r => r.notificationSent).map(r => (
                  <div key={r.id} className="p-3 bg-white dark:bg-neutral-800 rounded-2xl border border-slate-100 dark:border-neutral-700 shadow-xs flex items-start gap-3">
                    <div className="p-2 rounded-full bg-[#9AC31C]/20 text-[#6B8A0E] dark:text-[#9AC31C]">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-neutral-100">{r.title}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-300 mt-0.5">{r.clientName} - {r.description}</p>
                      <span className="text-[9px] text-slate-400 dark:text-neutral-500 mt-1 block">{new Date(r.scheduledAt).toLocaleString('es-EC')}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-white dark:bg-neutral-800 rounded-2xl border border-dashed border-slate-200 dark:border-neutral-700">
                  <Bell className="w-8 h-8 text-slate-300 dark:text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">No tienes alertas pendientes de lectura.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}

      {/* Barra de Navegación Inferior (4 Pestañas) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={reminders.filter(r => r.notificationSent).length}
      />

      {/* Modal Detalle de Recordatorio */}
      <ReminderDetailModal
        reminder={selectedReminder}
        isOpen={!!selectedReminder}
        onClose={() => setSelectedReminder(null)}
        onUpdated={fetchReminders}
        users={usersList}
        currentUser={user}
      />

      {/* Modal Administración de Usuarios y Asesores */}
      <AdminUserManagementModal
        isOpen={isAdminUsersModalOpen}
        onClose={() => setIsAdminUsersModalOpen(false)}
        users={usersList}
        onRefreshUsers={fetchUsers}
      />

    </div>
  );
}
