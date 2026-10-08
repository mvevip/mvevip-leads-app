import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import UserAvatar from './UserAvatar';
import { Camera, Upload, Check, X, Loader2, Sparkles } from 'lucide-react';

export default function FirstLoginPhotoModal({ isOpen }) {
  const { user, updateCurrentUser } = useAuth();
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Manejar selección de foto desde archivo o cámara del teléfono
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('La imagen debe pesar menos de 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Guardar Foto
  const handleSavePhoto = async () => {
    if (!avatarPreview) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await api.post('/auth/avatar', { avatarUrl: avatarPreview });
      updateCurrentUser({ avatarUrl: avatarPreview, isFirstLogin: false });
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error al guardar foto');
    } finally {
      setLoading(false);
    }
  };

  // Omitir Foto
  const handleSkip = async () => {
    setLoading(true);
    try {
      await api.post('/auth/skip-first-login');
      updateCurrentUser({ isFirstLogin: false });
    } catch (err) {
      // Continuar en caso de fallo de red
      updateCurrentUser({ isFirstLogin: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-neutral-850 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-neutral-700 animate-in fade-in zoom-in-95 text-center">
        
        <div className="w-12 h-12 bg-[#9AC31C]/20 text-[#678211] dark:text-[#9AC31C] rounded-2xl mx-auto flex items-center justify-center mb-3">
          <Camera className="w-6 h-6" />
        </div>

        <h3 className="text-base font-extrabold text-slate-900 dark:text-neutral-100">
          Personaliza tu Perfil
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 leading-relaxed">
          ¡Bienvenido <b>{user?.name}</b>! Sube o tómate una foto para que tus compañeros y clientes te identifiquen.
        </p>

        {errorMsg && (
          <div className="mt-3 p-2 bg-rose-50 text-rose-600 rounded-xl text-xs">
            {errorMsg}
          </div>
        )}

        {/* Previsualización del Avatar */}
        <div className="my-5 flex flex-col items-center">
          <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <UserAvatar
              user={user}
              avatarUrl={avatarPreview || user?.avatarUrl}
              className="w-24 h-24 text-2xl"
            />
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#9AC31C] text-neutral-950 flex items-center justify-center shadow-md">
              <Camera className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <span className="text-[11px] text-slate-400 dark:text-neutral-500 mt-2">
            Toca el círculo para tomarte una foto o seleccionar de tu galería
          </span>
        </div>

        {/* Botones de Acción */}
        <div className="space-y-2">
          {avatarPreview ? (
            <button
              disabled={loading}
              onClick={handleSavePhoto}
              className="w-full py-2.5 bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#9AC31C]/20 active:scale-95 transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Guardar Mi Foto</span>
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 bg-[#9AC31C] hover:bg-[#86AB17] text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#9AC31C]/20 active:scale-95 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Tomar o Subir Foto</span>
            </button>
          )}

          <button
            disabled={loading}
            onClick={handleSkip}
            className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 transition-colors"
          >
            Omitir por ahora (mostraré mis iniciales)
          </button>
        </div>

      </div>
    </div>
  );
}
