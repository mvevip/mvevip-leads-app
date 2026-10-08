import React, { useState, useRef, useEffect } from 'react';
import { Mic, Image as ImageIcon, Send, X, Sparkles, Check, Loader2, User, StopCircle, RotateCcw, Calendar, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

export default function GeminiBotModal({ isOpen, onClose, onReminderCreated, isAdmin = false, users = [] }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! Soy tu asistente de leads. Puedes dictarme un audio, escribir texto o adjuntar una captura de Chatrace. ¡Te responderé al instante!'
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [activeDraft, setActiveDraft] = useState(null);
  const [selectedAssignedId, setSelectedAssignedId] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const timerRef = useRef(null);

  // Auto-scroll al final del chat
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, imagePreview, audioBlob]);

  // Contador de segundos mientras graba
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  if (!isOpen) return null;

  // Iniciar grabación de audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setErrorMsg('No se pudo acceder al micrófono del dispositivo');
    }
  };

  // Detener grabación de audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Conversación reiniciada. ¿Qué nuevo lead o compromiso deseas agendar?'
      }
    ]);
    setActiveDraft(null);
    setInputText('');
    setSelectedImage(null);
    setImagePreview(null);
    setAudioBlob(null);
    setIsRecording(false);
  };

  // Enviar mensaje al turno conversacional (Texto, Audio solo o Imagen sola)
  const handleSendMessage = async () => {
    // Permitir enviar si hay texto O si hay audio O si hay imagen
    if (!inputText.trim() && !audioBlob && !selectedImage) return;

    const userText = inputText.trim();
    const currentImage = selectedImage;
    const currentAudio = audioBlob;
    const previewUrl = imagePreview;

    // Mensaje en la burbuja del usuario
    let bubbleText = userText;
    if (!bubbleText) {
      if (currentAudio) bubbleText = '🎙️ [Nota de voz enviada]';
      else if (currentImage) bubbleText = '🖼️ [Captura adjunta enviada]';
    }

    const userMessageId = Date.now().toString();
    const newUserMsg = {
      id: userMessageId,
      role: 'user',
      text: bubbleText,
      filePreview: previewUrl,
      fileType: currentImage ? 'image' : currentAudio ? 'audio' : null
    };

    setMessages(prev => [...prev, newUserMsg]);

    // Limpiar inputs de inmediato
    setInputText('');
    setSelectedImage(null);
    setImagePreview(null);
    setAudioBlob(null);
    setLoading(true);
    setErrorMsg(null);

    try {
      const historyPayload = messages.map(m => ({
        role: m.role,
        text: m.text
      }));

      const formData = new FormData();
      formData.append('history', JSON.stringify(historyPayload));
      formData.append('message', userText || (currentAudio ? 'Nota de voz enviada' : 'Captura enviada'));

      if (currentImage) {
        formData.append('file', currentImage);
      } else if (currentAudio) {
        formData.append('file', currentAudio, 'voice_record.webm');
      }

      const res = await api.post('/bot/conversation', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data && res.data.success) {
        const { reply, leadDraft, isReadyToSchedule } = res.data.data;

        if (leadDraft) {
          setActiveDraft(leadDraft);
        }

        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: reply,
            isReadyToSchedule: Boolean(isReadyToSchedule),
            draftData: leadDraft
          }
        ]);
      }
    } catch (err) {
      setErrorMsg('Error con Gemini: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Confirmar y Guardar Recordatorio en Firme
  const handleConfirmSave = async () => {
    if (!activeDraft) return;
    setLoading(true);
    try {
      await api.post('/reminders', {
        clientName: activeDraft.clientName || 'Cliente Chatrace',
        clientPhone: activeDraft.clientPhone,
        title: activeDraft.title || 'Recordatorio de Lead',
        description: activeDraft.description,
        scheduledAt: activeDraft.scheduledAt || new Date().toISOString(),
        priority: activeDraft.priority || 'MEDIUM',
        assignedId: isAdmin && selectedAssignedId ? selectedAssignedId : undefined,
        sourceType: 'BOT_TEXT'
      });

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          text: `🎉 ¡Excelente! El compromiso con "${activeDraft.clientName}" ha sido agendado exitosamente en tu agenda.`,
          saved: true
        }
      ]);

      setActiveDraft(null);
      onReminderCreated();
    } catch (err) {
      setErrorMsg('Error guardando recordatorio: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Formato mm:ss para grabación
  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Botón enviar habilitado si hay texto O audio O imagen
  const canSend = Boolean(inputText.trim() || audioBlob || selectedImage);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3">
      <div className="bg-white w-full max-w-md rounded-3xl p-4 shadow-2xl border border-slate-100 h-[90vh] max-h-[750px] flex flex-col animate-in fade-in slide-in-from-bottom-5">
        
        {/* Cabecera del Chat */}
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-slate-900 text-sm">Asistente Gemini</h3>
                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-full">
                  En línea
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Conversación inteligente tipo WhatsApp</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleResetChat}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title="Nueva conversación"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 shrink-0">
            {errorMsg}
          </div>
        )}

        {/* ÁREA DE MENSAJES (BURBUJAS) */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 px-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Imagen adjunta en el mensaje */}
              {msg.filePreview && (
                <div className="mb-1 rounded-2xl overflow-hidden border border-slate-200 max-w-[200px] shadow-xs">
                  <img src={msg.filePreview} alt="Captura" className="object-cover max-h-36 w-auto" />
                </div>
              )}

              {/* Burbuja de Texto */}
              <div
                className={`text-xs p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                    : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                }`}
              >
                {msg.text}
              </div>

              {/* TARJETA INTERACTIVA DE COMPROMISO DENTRO DEL CHAT */}
              {msg.draftData && !msg.saved && activeDraft && (
                <div className="mt-2 w-[90%] max-w-sm bg-gradient-to-br from-blue-50/90 to-indigo-50/80 border border-blue-200 rounded-2xl p-3 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-blue-900 border-b border-blue-200/60 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" /> Ficha del Compromiso
                    </span>
                    <span className="text-[9px] font-extrabold bg-blue-200/70 text-blue-800 px-2 py-0.5 rounded-full">
                      Borrador
                    </span>
                  </div>

                  {/* Asignación para Admin */}
                  {isAdmin && users.length > 0 && (
                    <div>
                      <span className="text-slate-500 font-semibold block text-[10px] flex items-center gap-1">
                        <User className="w-3 h-3 text-purple-600" /> Asignar a:
                      </span>
                      <select
                        value={selectedAssignedId}
                        onChange={(e) => setSelectedAssignedId(e.target.value)}
                        className="w-full font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 mt-0.5 text-xs"
                      >
                        <option value="">A mí mismo (o por defecto)</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-[10px]">Cliente:</span>
                      <span className="font-bold text-slate-800">{activeDraft.clientName}</span>
                    </div>

                    {activeDraft.clientPhone && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[10px]">Teléfono:</span>
                        <span className="font-semibold text-blue-600">{activeDraft.clientPhone}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-slate-400 text-[10px]">Fecha & Hora:</span>
                      <span className="font-bold text-slate-800">
                        {new Date(activeDraft.scheduledAt).toLocaleString('es-EC')}
                      </span>
                    </div>

                    {activeDraft.description && (
                      <div className="pt-1 border-t border-blue-100 text-[11px] text-slate-600 italic">
                        "{activeDraft.description}"
                      </div>
                    )}
                  </div>

                  <button
                    disabled={loading}
                    onClick={handleConfirmSave}
                    className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirmar y Agendar Lead
                  </button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Gemini está procesando tu solicitud...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* PREVISUALIZACIÓN DE ARCHIVOS LISTOS PARA ENVIAR (AUDIO O IMAGEN) */}
        {(imagePreview || audioBlob) && (
          <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-2xl mb-2 flex items-center justify-between shrink-0 animate-in fade-in">
            {imagePreview && (
              <div className="flex items-center gap-2.5">
                <img src={imagePreview} alt="Captura" className="w-10 h-10 object-cover rounded-xl border border-blue-200" />
                <div>
                  <span className="text-xs text-blue-950 font-bold block">Captura adjunta lista</span>
                  <span className="text-[10px] text-blue-600">Puedes escribir texto o pulsar enviar directamente</span>
                </div>
              </div>
            )}
            {audioBlob && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs text-blue-950 font-bold block">Nota de voz lista ({formatTimer(recordingSeconds)})</span>
                  <span className="text-[10px] text-blue-600">Presiona la flecha azul para enviar el audio</span>
                </div>
              </div>
            )}
            <button
              onClick={() => { removeImage(); removeAudio(); }}
              className="text-slate-400 hover:text-slate-600 p-1"
              title="Cancelar adjunto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* BARRA INFERIOR DEL CHAT CON MODO GRABACIÓN EN TIEMPO REAL */}
        <div className="pt-2 border-t border-slate-100 shrink-0">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* MODO GRABANDO AUDIO (TIPO WHATSAPP) */}
          {isRecording ? (
            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-2xl p-2 px-3 animate-pulse">
              <div className="flex items-center gap-2 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping"></span>
                <span className="text-xs font-bold">Grabando nota de voz...</span>
                <span className="text-xs font-mono font-bold ml-1">{formatTimer(recordingSeconds)}</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs active:scale-95 transition-all"
              >
                <StopCircle className="w-4 h-4" />
                <span>Listo</span>
              </button>
            </div>
          ) : (
            /* MODO NORMAL INPUT CHAT */
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-2xl p-1.5 pl-2.5 border border-slate-200/80">
              
              {/* Botón Adjuntar Imagen de Captura */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-xl transition-colors ${
                  selectedImage ? 'text-blue-600 bg-white shadow-xs' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Adjuntar captura de Chatrace"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Botón Grabar Audio (Micrófono) */}
              <button
                type="button"
                onClick={startRecording}
                className={`p-2 rounded-xl transition-all ${
                  audioBlob ? 'text-blue-600 bg-white shadow-xs' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Tocar para grabar nota de voz"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Input de Texto */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading && canSend) {
                    handleSendMessage();
                  }
                }}
                placeholder={
                  selectedImage
                    ? "Comentario opcional de la captura..."
                    : audioBlob
                    ? "Comentario opcional del audio..."
                    : "Escribe tu mensaje..."
                }
                className="flex-1 bg-transparent border-0 text-xs text-slate-800 placeholder-slate-400 focus:outline-none px-1"
              />

              {/* Botón Enviar (Habilitado con Texto O Audio O Imagen sola) */}
              <button
                disabled={loading || !canSend}
                onClick={handleSendMessage}
                className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition-all"
                title="Enviar (Texto, Audio o Imagen)"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>

            </div>
          )}
          
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 px-1">
            <span>🎙️ Graba un audio o sube una captura y pulsa la flecha azul para enviar</span>
            {activeDraft && (
              <span className="text-blue-600 font-bold">Ficha activa disponible</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
