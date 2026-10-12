import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { 
  Send, Mic, Image as ImageIcon, Sparkles, Loader2, RefreshCw, 
  Trash2, StopCircle, X, Maximize2, CheckCircle2, Clock, Calendar, 
  User, Phone, ChevronRight, AlertCircle 
} from 'lucide-react';

/**
 * Renderizador de Markdown simple y seguro para el chat:
 * Soporta tablas (| a | b |), negritas (**texto**), listas (- item) y saltos de línea.
 */
function FormattedChatText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let tableRows = [];
  let inTable = false;

  const flushTable = (key) => {
    if (tableRows.length === 0) return;
    
    // Separar encabezado de cuerpo
    const headerRow = tableRows[0];
    const dataRows = tableRows.slice(1).filter(r => !r.every(c => /^[-:\s]+$/.test(c)));

    elements.push(
      <div key={`table-${key}`} className="my-2.5 overflow-x-auto no-scrollbar rounded-xl border border-slate-200 dark:border-neutral-700 shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#9AC31C]/15 dark:bg-[#9AC31C]/20 text-slate-800 dark:text-neutral-100 font-bold border-b border-slate-200 dark:border-neutral-700">
              {headerRow.map((cell, idx) => (
                <th key={idx} className="py-2 px-2.5 whitespace-nowrap">
                  <span dangerouslySetInnerHTML={{ __html: parseInline(cell.trim()) }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-2.5 text-slate-700 dark:text-neutral-200 whitespace-nowrap">
                    <span dangerouslySetInnerHTML={{ __html: parseInline(cell.trim()) }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Detección de fila de tabla markdown (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cells = trimmed.split('|').slice(1, -1);
      tableRows.push(cells);
      return;
    }

    if (inTable) {
      flushTable(index);
    }

    if (!trimmed) {
      elements.push(<div key={`empty-${index}`} className="h-1.5" />);
      return;
    }

    // Encabezados Markdown (###, ##, #)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${index}`} className="font-extrabold text-[#6B8A0E] dark:text-[#9AC31C] text-xs uppercase tracking-wide mt-2 mb-1" dangerouslySetInnerHTML={{ __html: parseInline(trimmed.substring(4)) }} />
      );
      return;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <h3 key={`h2-${index}`} className="font-black text-slate-900 dark:text-neutral-100 text-sm mt-2.5 mb-1" dangerouslySetInnerHTML={{ __html: parseInline(headingText) }} />
      );
      return;
    }

    // Listas con viñetas
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.substring(2);
      elements.push(
        <div key={`li-${index}`} className="flex items-start gap-1.5 my-1">
          <span className="text-[#9AC31C] font-bold">•</span>
          <span dangerouslySetInnerHTML={{ __html: parseInline(content) }} />
        </div>
      );
      return;
    }

    // Párrafos regulares con formato inline
    elements.push(
      <p key={`p-${index}`} className="my-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: parseInline(trimmed) }} />
    );
  });

  if (inTable) {
    flushTable('last');
  }

  return <div className="space-y-0.5 text-xs sm:text-sm">{elements}</div>;
}

function parseInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-black/10 dark:bg-white/10 rounded font-mono text-[11px]">$1</code>');
}

export default function AssistantChatView({ user, onReminderUpdated }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);

  // Image attachment & Drag and Drop
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Modal para ver imagen en grande (Lightbox)
  const [previewModalUrl, setPreviewModalUrl] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const timerRef = useRef(null);

  // Cargar historial de conversación de la BD
  const loadChatHistory = async () => {
    try {
      setFetchingHistory(true);
      const res = await api.get('/bot/history');
      if (res.data?.data && res.data.data.length > 0) {
        setMessages(res.data.data);
      } else {
        // Mensaje de bienvenida inicial si no hay historial
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: `¡Hola ${user?.name || 'Asesor'}! Soy tu Asistente Comercial de MVEVIP. 🚀\n\nEstoy conectado en tiempo real a tus leads y compromisos en la base de datos. Puedes preguntarme:\n- *"¿Cuáles son mis pendientes de hoy?"*\n- *"El cliente Carlos reagendó para mañana a las 3pm"*\n- *"El cliente Juan quiere otra cotización"*\n- *"Déjame ver la foto del cliente María"*\n\n¿En qué te ayudo ahora?`
          }
        ]);
      }
    } catch (err) {
      console.error('Error cargando historial de chat:', err);
    } finally {
      setFetchingHistory(false);
    }
  };

  useEffect(() => {
    loadChatHistory();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, imagePreview, audioBlob]);

  // Temporizador de audio
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
      alert('No se pudo acceder al micrófono del dispositivo. Revisa los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen debe pesar menos de 10MB');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Manejadores para Drag & Drop de Imágenes
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        alert('Por favor arrastra únicamente un archivo de imagen (JPG, PNG, WEBP, etc.)');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen debe pesar menos de 10MB');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Manejador para pegar imagen desde portapapeles (Ctrl + V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            alert('La imagen del portapapeles excede los 10MB');
            return;
          }
          setSelectedImage(file);
          setImagePreview(URL.createObjectURL(file));
          e.preventDefault();
          break;
        }
      }
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedAudio = () => {
    setAudioBlob(null);
  };

  // Enviar mensaje o consulta al Asistente
  const handleSendMessage = async (textOverride = null) => {
    const textToSend = textOverride || inputText.trim();
    if (!textToSend && !selectedImage && !audioBlob) return;

    const userMessageId = `user-${Date.now()}`;
    const userPreviewUrl = imagePreview;

    // Agregar mensaje local inmediato
    const optimisticUserMsg = {
      id: userMessageId,
      role: 'user',
      content: textToSend || (audioBlob ? '🎤 [Nota de voz enviada]' : '📸 [Captura enviada]'),
      mediaUrl: userPreviewUrl,
      createdAt: new Date()
    };

    setMessages(prev => [...prev, optimisticUserMsg]);
    setInputText('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', textToSend);

      if (selectedImage) {
        formData.append('file', selectedImage);
      } else if (audioBlob) {
        formData.append('file', audioBlob, 'voice-note.webm');
      }

      // Limpiar previews
      setSelectedImage(null);
      setImagePreview(null);
      setAudioBlob(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const res = await api.post('/bot/turn', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success && res.data.data) {
        const botData = res.data.data;
        setMessages(prev => [
          ...prev,
          {
            id: botData.id || `bot-${Date.now()}`,
            role: 'assistant',
            content: botData.content,
            mediaUrl: botData.mediaUrl,
            images: botData.images,
            actions: botData.actions,
            createdAt: botData.createdAt || new Date()
          }
        ]);

        // Si se actualizaron o crearon compromisos, refrescar la agenda
        if (onReminderUpdated && botData.actions?.length > 0) {
          onReminderUpdated();
        }
      }
    } catch (err) {
      console.error('Error al comunicarse con el Asistente:', err);
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: '⚠️ Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.',
          createdAt: new Date()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Limpiar historial de chat
  const handleClearHistory = async () => {
    if (!window.confirm('¿Deseas reiniciar la conversación con el Asistente?')) return;
    try {
      await api.delete('/bot/history');
      setMessages([
        {
          id: 'welcome-reset',
          role: 'assistant',
          content: `Conversación reiniciada. ¿Qué consulta o gestión comercial deseas realizar ahora?`
        }
      ]);
    } catch (err) {
      console.error('Error limpiando historial:', err);
    }
  };

  // Chips de preguntas rápidas
  const quickActions = [
    '¿Cuáles son mis compromisos de hoy?',
    '¿Qué pendientes me faltan por realizar?',
    'Ver clientes pendientes de llamada'
  ];

  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 min-h-0 flex flex-col w-full overflow-hidden pb-[78px] md:pb-2"
    >
      {/* Overlay Drag & Drop para imágenes */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[#F8FAFC]/90 dark:bg-[#121212]/90 backdrop-blur-xs flex flex-col items-center justify-center border-3 border-dashed border-[#9AC31C] rounded-2xl m-2 pointer-events-none transition-all">
          <div className="w-16 h-16 rounded-2xl bg-[#9AC31C]/20 border border-[#9AC31C]/40 flex items-center justify-center text-[#6B8A0E] dark:text-[#9AC31C] mb-3 animate-bounce">
            <ImageIcon className="w-8 h-8 stroke-[2.2]" />
          </div>
          <p className="text-base font-extrabold text-slate-900 dark:text-neutral-100">
            Suelta tu imagen aquí
          </p>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
            Se adjuntará como captura o foto para el Asistente IA
          </p>
        </div>
      )}
      
      {/* Barra Superior del Asistente (Compacta) */}
      <div className="shrink-0 py-1.5 px-3 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border border-slate-200/70 dark:border-neutral-800 rounded-xl flex items-center justify-between shadow-xs mb-1.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-[#9AC31C]/20 border border-[#9AC31C]/30 flex items-center justify-center text-[#6B8A0E] dark:text-[#9AC31C]">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-1 ring-white dark:ring-neutral-900" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-neutral-100 flex items-center gap-1.5 leading-tight">
              Asistente Comercial
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-neutral-400 leading-tight">En línea</p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          title="Reiniciar conversación"
          className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Feed de Mensajes con Scroll fluido sin barras feas */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-1 space-y-3 pb-2 overscroll-contain">
        {fetchingHistory ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2 text-[#9AC31C]" />
            <span className="text-xs">Cargando conversación previa...</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}
              >
                <div
                  className={`max-w-[88%] md:max-w-2xl lg:max-w-3xl rounded-2xl p-3.5 shadow-xs ${
                    isUser
                      ? 'bg-neutral-900 text-white dark:bg-neutral-800 rounded-br-xs'
                      : 'bg-white dark:bg-neutral-850 text-slate-800 dark:text-neutral-100 border border-slate-200/80 dark:border-neutral-700/80 rounded-bl-xs'
                  }`}
                >
                  {/* Foto adjunta o imagen del lead */}
                  {msg.mediaUrl && (
                    <div className="mb-2 relative rounded-xl overflow-hidden border border-slate-200 dark:border-neutral-700 group cursor-pointer"
                         onClick={() => setPreviewModalUrl(msg.mediaUrl)}>
                      <img
                        src={msg.mediaUrl}
                        alt="Adjunto o foto de lead"
                        className="max-h-48 w-full object-cover rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1">
                        <Maximize2 className="w-4 h-4" /> Ver foto completa
                      </div>
                    </div>
                  )}

                  {/* Texto formateado */}
                  <FormattedChatText text={msg.content} />

                  {/* Acciones realizadas en base de datos si las hubo */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-neutral-700/60 flex flex-wrap gap-1.5">
                      {msg.actions.map((act, aIdx) => (
                        <span
                          key={aIdx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#9AC31C]/15 text-[#6B8A0E] dark:text-[#9AC31C] text-[10px] font-bold"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {act.tool === 'update_reminder' ? 'Compromiso actualizado' :
                           act.tool === 'add_followup_note' ? 'Nota registrada' :
                           act.tool === 'create_reminder' ? 'Nuevo lead creado' : 'Actualizado'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <span className="text-[9px] text-slate-400 dark:text-neutral-500 mt-1 px-1">
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            );
          })
        )}

        {/* Indicador de escritura del Asistente */}
        {loading && (
          <div className="flex items-center gap-2 p-3 bg-white dark:bg-neutral-850 rounded-2xl border border-slate-200/80 dark:border-neutral-700 max-w-[200px] shadow-xs">
            <Loader2 className="w-4 h-4 text-[#9AC31C] animate-spin" />
            <span className="text-xs text-slate-500 dark:text-neutral-400 font-medium animate-pulse">
              Escribiendo...
            </span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Sugerencias Rápidas de Consulta */}
      {messages.length <= 4 && !loading && (
        <div className="shrink-0 py-1 flex flex-wrap sm:grid sm:grid-cols-3 gap-1.5 overflow-x-auto no-scrollbar">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(action)}
              className="text-center truncate px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 hover:bg-[#9AC31C]/20 border border-slate-200 dark:border-neutral-700 text-[11px] text-slate-700 dark:text-neutral-300 font-medium transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {/* Preview de Archivos Adjuntos antes de enviar */}
      {(imagePreview || audioBlob) && (
        <div className="shrink-0 p-2 mb-1.5 bg-slate-100 dark:bg-neutral-800 rounded-2xl border border-slate-200 dark:border-neutral-700 flex items-center justify-between">
          {imagePreview && (
            <div className="flex items-center gap-2 min-w-0">
              <img src={imagePreview} alt="Preview" className="w-10 h-10 object-cover rounded-lg shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-neutral-200 truncate">Captura adjunta</span>
            </div>
          )}
          {audioBlob && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#9AC31C]/20 text-[#9AC31C] flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-neutral-200 truncate">Nota de voz lista</span>
            </div>
          )}
          <button
            onClick={imagePreview ? removeSelectedImage : removeSelectedAudio}
            className="p-1 text-slate-400 hover:text-rose-500 rounded-full shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Entrada (Input bar con Voz, Capturas y Texto) */}
      <div className="shrink-0 pt-1">
        <div className="p-1.5 bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 rounded-2xl shadow-sm flex items-center gap-1.5">
          
          {/* Input oculto para subir capturas */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          {/* Botón adjuntar imagen */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isRecording}
            className="p-1.5 text-slate-400 hover:text-[#9AC31C] dark:hover:text-[#9AC31C] rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40 shrink-0"
            title="Adjuntar captura o foto"
          >
            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Grabación de Audio */}
          {isRecording ? (
            <div className="flex-1 min-w-0 flex items-center justify-between px-3 py-1 bg-rose-50 dark:bg-rose-950/40 rounded-xl text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="text-xs font-bold truncate">Grabando... {recordingSeconds}s</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <StopCircle className="w-4 h-4" /> Detener
              </button>
            </div>
          ) : (
            <>
              {/* Campo de Texto */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                onPaste={handlePaste}
                placeholder="Pregúntale al asistente comercial..."
                disabled={loading}
                className="flex-1 min-w-0 py-1.5 px-2 bg-transparent text-xs sm:text-sm text-slate-800 dark:text-neutral-100 placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none"
              />

              {/* Botón Micrófono */}
              <button
                type="button"
                onClick={startRecording}
                disabled={loading}
                className="p-1.5 text-slate-400 hover:text-[#9AC31C] dark:hover:text-[#9AC31C] rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40 shrink-0"
                title="Grabar nota de voz"
              >
                <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}

          {/* Botón Enviar */}
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={loading || isRecording || (!inputText.trim() && !selectedImage && !audioBlob)}
            className="p-2 sm:p-2.5 bg-[#9AC31C] hover:bg-[#86AB17] active:scale-95 text-neutral-950 rounded-xl transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>

        </div>
      </div>

      {/* Lightbox / Modal para ver foto completa del lead */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-lg w-full bg-neutral-900 rounded-3xl p-3 border border-neutral-700 overflow-hidden">
            <button
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewModalUrl}
              alt="Foto completa del lead"
              className="max-h-[80vh] w-full object-contain rounded-2xl"
            />
          </div>
        </div>
      )}

    </div>
  );
}
