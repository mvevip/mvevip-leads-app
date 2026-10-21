const { processAssistantTurn } = require('../services/geminiService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uploadToS3 } = require('../services/s3Service');
const { logError } = require('../utils/logger');
const { getRequestId } = require('../utils/requestContext');

/**
 * Endpoint conversacional multi-turno con el Asistente IA permanente
 */
const handleConversationTurn = async (req, res) => {
  try {
    const user = req.user;
    const message = req.body.message || '';
    const fileBuffer = req.file ? req.file.buffer : null;
    const mimeType = req.file ? req.file.mimetype : null;

    if (!message && !fileBuffer) {
      return res.status(400).json({ error: 'Debes enviar un mensaje, nota de voz o imagen.' });
    }

    // 1. Si adjuntó archivo, guardar en S3 o generar data URI
    let userMediaUrl = null;
    if (fileBuffer && mimeType) {
      if (mimeType.startsWith('image/')) {
        const ext = mimeType.split('/')[1] || 'png';
        const s3Url = await uploadToS3('chat-images', `lead-attach.${ext}`, fileBuffer, mimeType);
        userMediaUrl = s3Url || `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      }
    }

    // 2. Guardar mensaje del usuario en la base de datos
    const savedUserMsg = await prisma.chatMessage.create({
      data: {
        userId: user.id,
        role: 'user',
        content: message || (fileBuffer ? '[Archivo adjunto]' : ''),
        mediaUrl: userMediaUrl
      }
    });

    // 3. Recuperar historial reciente de la base de datos para contexto
    const dbHistory = await prisma.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 12
    });
    // Reordenar ascendente para el modelo
    const history = dbHistory.reverse().map(m => ({
      role: m.role,
      content: m.content
    }));

    // 4. Procesar turno con Gemini y Tool Calling sobre la BD
    const turnResult = await processAssistantTurn(
      user,
      history,
      message,
      fileBuffer,
      mimeType,
      new Date()
    );

    // Si el turno falló, se responde con un mensaje amable pero NO se guarda en el historial
    // (evita contaminar el contexto que se reenvía a Gemini en los siguientes turnos)
    if (turnResult.isError) {
      return res.json({
        success: true,
        data: {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: turnResult.reply,
          mediaUrl: null,
          images: [],
          actions: turnResult.actions || [],
          isError: true,
          createdAt: new Date()
        }
      });
    }

    // 5. Determinar mediaUrl del bot si devolvió imágenes de leads consultados
    const botMediaUrl = turnResult.images && turnResult.images.length > 0 ? turnResult.images[0] : null;

    // 6. Guardar respuesta del asistente en la base de datos
    const savedBotMsg = await prisma.chatMessage.create({
      data: {
        userId: user.id,
        role: 'assistant',
        content: turnResult.reply,
        mediaUrl: botMediaUrl,
        metadata: turnResult.actions ? turnResult.actions : null
      }
    });

    return res.json({
      success: true,
      data: {
        id: savedBotMsg.id,
        role: 'assistant',
        content: turnResult.reply,
        mediaUrl: botMediaUrl,
        images: turnResult.images || [],
        actions: turnResult.actions || [],
        createdAt: savedBotMsg.createdAt
      }
    });
  } catch (error) {
    const requestId = getRequestId();
    logError('bot_turn', error, { requestId, userId: req.user?.id });
    return res.status(500).json({ error: 'Error procesando consulta del asistente', requestId });
  }
};

/**
 * Recuperar el historial de chat persistente del usuario
 */
const getChatHistory = async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      take: 60
    });

    return res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error en getChatHistory:', error);
    return res.status(500).json({ error: 'Error obteniendo historial de chat' });
  }
};

/**
 * Limpiar el historial de chat para iniciar nueva conversación
 */
const clearChatHistory = async (req, res) => {
  try {
    await prisma.chatMessage.deleteMany({
      where: { userId: req.user.id }
    });

    return res.json({
      success: true,
      message: 'Historial de conversación reiniciado con éxito'
    });
  } catch (error) {
    console.error('Error en clearChatHistory:', error);
    return res.status(500).json({ error: 'Error limpiando historial' });
  }
};

module.exports = {
  handleConversationTurn,
  getChatHistory,
  clearChatHistory
};
