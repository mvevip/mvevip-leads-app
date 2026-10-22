const express = require('express');
const router = express.Router();
const multer = require('multer');

// Middleware
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Controladores
const authController = require('../controllers/authController');
const reminderController = require('../controllers/reminderController');
const botController = require('../controllers/botController');
const adminController = require('../controllers/adminController');
const pushController = require('../controllers/pushController');
const { logError } = require('../utils/logger');
const { requireCronSecret } = require('../middleware/cronAuth');

// Multer en memoria para audio e imágenes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max
});

// Rutas de Autenticación & Perfil
router.post('/auth/login', authController.login);
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, authController.updateAvatar);
router.post('/auth/skip-first-login', authMiddleware, authController.skipFirstLogin);
router.get('/auth/profile', authMiddleware, authController.getProfile);

// Rutas de Recordatorios (Protegidas)
router.get('/reminders', authMiddleware, reminderController.getReminders);
router.post('/reminders', authMiddleware, reminderController.createReminder);
router.get('/reminders/:id', authMiddleware, reminderController.getReminderById);
router.patch('/reminders/:id/complete', authMiddleware, reminderController.completeReminder);
router.patch('/reminders/:id/reopen', authMiddleware, reminderController.reopenReminder);
router.patch('/reminders/:id/dismiss', authMiddleware, reminderController.dismissReminder);
router.patch('/reminders/:id/transfer', authMiddleware, reminderController.transferReminder);
router.post('/reminders/:id/followups', authMiddleware, reminderController.addFollowup);

// Rutas del Chatbot Asistente Conversacional Multimodal (Gemini API con Tool Calling & DB)
router.get('/bot/history', authMiddleware, botController.getChatHistory);
router.delete('/bot/history', authMiddleware, botController.clearChatHistory);
router.post('/bot/conversation', authMiddleware, upload.single('file'), botController.handleConversationTurn);
router.post('/bot/turn', authMiddleware, upload.single('file'), botController.handleConversationTurn);

// Rutas de Notificaciones Web Push
router.get('/push/public-key', pushController.getPublicKey);
router.post('/push/subscribe', authMiddleware, pushController.subscribe);
router.post('/push/unsubscribe', authMiddleware, pushController.unsubscribe);
router.post('/push/test', authMiddleware, pushController.sendTestNotification);

// Ruta de Despacho Cron de Recordatorios (Invocada por EventBridge o llamada directa)
router.get('/cron/check-reminders', requireCronSecret, async (req, res) => {
  try {
    const { checkAndNotifyDueReminders } = require('../services/cronScheduler');
    const result = await checkAndNotifyDueReminders();
    return res.json({ success: true, ...result });
  } catch (err) {
    logError('cron_route', err);
    return res.status(500).json({ success: false, error: 'Error ejecutando el cron de recordatorios' });
  }
});

// Rutas de Administración (Solo ADMIN)
router.get('/admin/users', authMiddleware, requireAdmin, adminController.getUsers);
router.post('/admin/users', authMiddleware, requireAdmin, adminController.createUser);
router.patch('/admin/users/:id/role', authMiddleware, requireAdmin, adminController.updateUserRole);
router.patch('/admin/users/:id/toggle-status', authMiddleware, requireAdmin, adminController.toggleUserStatus);
router.post('/admin/users/:id/reset-password', authMiddleware, requireAdmin, adminController.resetUserPassword);
router.post('/admin/notifications', authMiddleware, requireAdmin, adminController.sendCustomNotification);
router.get('/admin/stats', authMiddleware, requireAdmin, adminController.getAdminStats);

module.exports = router;
