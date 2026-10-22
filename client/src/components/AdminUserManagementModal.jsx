import React, { useState } from 'react';
import api from '../services/api';
import { UserPlus, UserX, UserCheck, UserCog, KeyRound, Check, X, Shield, Share2 } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { useAuth } from '../context/AuthContext';

export default function AdminUserManagementModal({ isOpen, onClose, onUserUpdated, users = [], onRefreshUsers }) {
  const { user: currentUser } = useAuth();
  const [filterActive, setFilterActive] = useState('ALL'); // 'ALL', 'ACTIVE', 'INACTIVE'
  const [isCreating, setIsCreating] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState(null); // { name, email, tempPassword, link }

  // Formulario nuevo usuario
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('ASESOR');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const appBaseUrl = window.location.origin;

  // Filtrar según Switch Activos / Inactivos
  const displayedUsers = users.filter(u => {
    if (filterActive === 'ACTIVE') return u.isActive;
    if (filterActive === 'INACTIVE') return !u.isActive;
    return true;
  });

  const activeCount = users.filter(u => u.isActive).length;
  const inactiveCount = users.filter(u => !u.isActive).length;

  // Crear Usuario
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const generatedPass = newPassword || 'MVEVIP' + Math.floor(1000 + Math.random() * 9000);
      const res = await api.post('/admin/users', {
        name: newName,
        email: newEmail,
        phone: newPhone,
        role: newRole,
        password: generatedPass
      });

      setIsCreating(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      onRefreshUsers();

      // Abrir modal de credenciales listas para compartir
      setCredentialsModal({
        name: res.data.user.name,
        email: res.data.user.email,
        tempPassword: generatedPass,
        link: appBaseUrl
      });
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  // Toggle Activar / Deshabilitar Usuario
  const handleToggleStatus = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}/toggle-status`);
      onRefreshUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar estado');
    }
  };

  // Cambiar el tipo de usuario (Administrador <-> Asesor)
  const handleChangeRole = async (user) => {
    const newRole = user.role === 'ADMIN' ? 'ASESOR' : 'ADMIN';
    const newRoleLabel = newRole === 'ADMIN' ? 'Administrador' : 'Asesor Comercial';
    const consequence = newRole === 'ADMIN'
      ? 'Podrá ver y gestionar los recordatorios de todo el equipo y administrar usuarios.'
      : 'Solo podrá ver y gestionar sus propios recordatorios y perderá el acceso a la administración.';

    if (!window.confirm(`¿Cambiar a ${user.name} a ${newRoleLabel}?\n\n${consequence}\n\nSe cerrará su sesión y deberá volver a iniciar sesión.`)) {
      return;
    }

    try {
      const res = await api.patch(`/admin/users/${user.id}/role`, { role: newRole });
      onRefreshUsers();
      alert(res.data?.message || `Tipo de usuario actualizado a ${newRoleLabel}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar el tipo de usuario');
    }
  };

  // Resetear Contraseña
  const handleResetPassword = async (user) => {
    if (!window.confirm(`¿Deseas resetear la contraseña de ${user.name}? Se le obligará a crear una nueva al iniciar sesión.`)) {
      return;
    }

    try {
      const res = await api.post(`/admin/users/${user.id}/reset-password`);
      onRefreshUsers();

      setCredentialsModal({
        name: res.data.name,
        email: res.data.email,
        tempPassword: res.data.tempPassword,
        link: appBaseUrl
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Error al resetear contraseña');
    }
  };

  // Construir mensaje de texto preformateado
  const getShareMessage = (info) => {
    return `👋 Hola ${info.name}, aquí tienes tu acceso a la aplicación de Recordatorios de Leads MVEVIP:
🔗 Enlace: ${info.link}
📧 Usuario: ${info.email}
🔑 Clave temporal: ${info.tempPassword}

*Nota*: Al ingresar por primera vez, el sistema te solicitará crear tu contraseña definitiva.`;
  };

  // Compartir nativo (permite seleccionar WhatsApp, Gmail, Telegram, SMS, etc.)
  const handleShare = async (info) => {
    const shareData = {
      title: 'Accesos MVEVIP Leads PWA',
      text: getShareMessage(info)
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Cancelado por el usuario
      }
    } else if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Fallback a portapapeles si da error
        copyFallback(info);
      }
    } else {
      // Fallback para navegadores de escritorio que no tengan soporte Web Share API
      copyFallback(info);
    }
  };

  const copyFallback = (info) => {
    navigator.clipboard.writeText(getShareMessage(info));
    alert('¡Datos copiados al portapapeles! Ya puedes pegarlos en cualquier aplicación.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3">
      <div className="bg-white dark:bg-neutral-850 w-full max-w-lg md:max-w-2xl rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-neutral-750 max-h-[90vh] flex flex-col animate-in fade-in">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Gestión de Usuarios & Asesores</h3>
              <p className="text-[10px] text-slate-400">Control de cuentas, accesos y contraseñas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Acciones: Botón Agregar + Switch Activos / Inactivos */}
        <div className="py-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isCreating ? 'Cancelar' : 'Nuevo Asesor'}</span>
          </button>

          {/* Switch Activos / Deshabilitados */}
          <div className="bg-slate-100 p-0.5 rounded-xl flex text-[11px] font-bold">
            <button
              onClick={() => setFilterActive('ALL')}
              className={`py-1.5 px-2.5 rounded-lg transition-all ${filterActive === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-400'}`}
            >
              Todos ({users.length})
            </button>
            <button
              onClick={() => setFilterActive('ACTIVE')}
              className={`py-1.5 px-2.5 rounded-lg transition-all ${filterActive === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-400'}`}
            >
              Activos ({activeCount})
            </button>
            <button
              onClick={() => setFilterActive('INACTIVE')}
              className={`py-1.5 px-2.5 rounded-lg transition-all ${filterActive === 'INACTIVE' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-400'}`}
            >
              Inactivos ({inactiveCount})
            </button>
          </div>
        </div>

        {/* FORMULARIO CREAR USUARIO (SI ESTÁ ABIERTO) */}
        {isCreating && (
          <form onSubmit={handleCreateUser} className="p-3.5 my-2 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shrink-0 animate-in fade-in">
            <h4 className="text-xs font-extrabold text-slate-800">Registrar Nuevo Colaborador</h4>
            
            {errorMsg && (
              <div className="p-2 bg-rose-50 border border-rose-100 rounded-xl text-[11px] text-rose-600">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nombre completo"
                className="p-2 bg-white border border-slate-200 rounded-xl text-xs"
              />
              <input
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="correo@marketingvip.com"
                className="p-2 bg-white border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <input
                type="text"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Teléfono móvil"
                className="p-2 bg-white border border-slate-200 rounded-xl text-xs col-span-1"
              />
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold col-span-1"
              >
                <option value="ASESOR">Asesor</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Clave (Auto si vacía)"
                className="p-2 bg-white border border-slate-200 rounded-xl text-xs col-span-1"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Guardar y Generar Accesos</span>
            </button>
          </form>
        )}

        {/* LISTADO DE USUARIOS CON SWITCH Y ACCIONES */}
        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {displayedUsers.map(u => (
            <div
              key={u.id}
              className={`p-3 rounded-2xl border transition-all ${
                u.isActive ? 'bg-white border-slate-100 shadow-xs' : 'bg-slate-50 border-slate-200/80 opacity-65'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserAvatar user={u} className="w-10 h-10 text-xs" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-800">{u.name}</h4>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                      {u.mustChangePassword && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded-full">
                          Clave Pendiente
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block">{u.email}</span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  u.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {u.isActive ? 'Activo' : 'Deshabilitado'}
                </span>
              </div>

              {/* Botonera de Gestión por Usuario */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                
                {/* Cambiar tipo de usuario (no se puede cambiar el propio) */}
                <button
                  onClick={() => handleChangeRole(u)}
                  disabled={u.id === currentUser?.id}
                  className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
                  title={u.id === currentUser?.id ? 'No puedes cambiar tu propio tipo de usuario' : (u.role === 'ADMIN' ? 'Convertir en Asesor Comercial' : 'Convertir en Administrador')}
                >
                  <UserCog className="w-3 h-3 text-purple-600" />
                  <span>{u.role === 'ADMIN' ? 'Pasar a Asesor' : 'Pasar a Administrador'}</span>
                </button>

                {/* Resetear Contraseña */}
                <button
                  onClick={() => handleResetPassword(u)}
                  className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                  title="Generar nueva clave y obligar al usuario a cambiarla"
                >
                  <KeyRound className="w-3 h-3 text-amber-600" />
                  <span>Resetear Clave</span>
                </button>

                {/* Habilitar / Deshabilitar */}
                <button
                  onClick={() => handleToggleStatus(u)}
                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                    u.isActive
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {u.isActive ? (
                    <>
                      <UserX className="w-3 h-3" />
                      <span>Deshabilitar</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-3 h-3" />
                      <span>Activar</span>
                    </>
                  )}
                </button>

              </div>
            </div>
          ))}

          {displayedUsers.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">
              No hay usuarios en esta categoría.
            </div>
          )}
        </div>

        {/* MODAL CON UN SOLO BOTÓN "COMPARTIR" */}
        {credentialsModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-2.5">
                <div className="flex items-center gap-2 text-emerald-600">
                  <Check className="w-5 h-5 font-bold" />
                  <h4 className="text-sm font-extrabold text-slate-900">Accesos Generados</h4>
                </div>
                <button onClick={() => setCredentialsModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Toca el botón <b>Compartir</b> para seleccionar la aplicación por donde enviar las credenciales a <b>{credentialsModal.name}</b>:
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs font-mono mb-4">
                <div><span className="text-slate-400">Enlace:</span> <span className="text-blue-600 font-bold">{credentialsModal.link}</span></div>
                <div><span className="text-slate-400">Usuario:</span> <span className="text-slate-800 font-bold">{credentialsModal.email}</span></div>
                <div><span className="text-slate-400">Clave Temporal:</span> <span className="text-amber-600 font-bold">{credentialsModal.tempPassword}</span></div>
              </div>

              {/* ÚNICO BOTÓN: COMPARTIR */}
              <button
                onClick={() => handleShare(credentialsModal)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir</span>
              </button>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
