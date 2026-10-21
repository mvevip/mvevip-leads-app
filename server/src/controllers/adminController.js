const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const { sendBroadcastPush, sendPushToUser } = require('../services/webPushService');
const { normalizeMediaUrl } = require('../services/s3Service');
const { validatePassword, generateTempPassword } = require('../utils/passwords');
const { bumpTokenVersion } = require('../utils/sessionVersion');

/**
 * Listar todos los usuarios / asesores (con soporte para filtro active/inactive)
 */
const getUsers = async (req, res) => {
  try {
    const { status } = req.query; // 'active', 'inactive' o undefined
    const where = {};

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        _count: {
          select: { assignedReminders: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(users);
  } catch (error) {
    console.error('Error listando usuarios:', error);
    return res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

/**
 * Crear un nuevo usuario (asesor o admin) con contraseña temporal y mustChangePassword = true
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'ASESOR', phone, avatarUrl } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo electrónico y contraseña inicial son obligatorios' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (existing) {
      return res.status(400).json({ error: 'El email ya se encuentra registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role,
        phone,
        avatarUrl: avatarUrl ? normalizeMediaUrl(avatarUrl) : null,
        isActive: true,
        mustChangePassword: true, // Nuevo usuario debe cambiar clave
        isFirstLogin: true // Nuevo usuario debe registrar o omitir foto
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        mustChangePassword: true,
        isFirstLogin: true
      }
    });

    return res.status(201).json({
      message: 'Usuario creado exitosamente',
      user,
      initialPassword: password
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
};

/**
 * Habilitar o Deshabilitar usuario (Toggle Active/Inactive)
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes deshabilitar tu propia cuenta' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !targetUser.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    return res.json({
      message: updated.isActive ? 'Usuario activado exitosamente' : 'Usuario deshabilitado exitosamente',
      user: updated
    });
  } catch (error) {
    console.error('Error cambiando estado de usuario:', error);
    return res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

/**
 * Resetear contraseña de un asesor (Genera nueva clave temporal y marca mustChangePassword = true)
 */
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si no se envía contraseña, generar una aleatoria (criptográficamente segura) fácil de compartir
    if (newPassword) {
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }
    const generatedPass = newPassword || generateTempPassword();
    const passwordHash = await bcrypt.hash(generatedPass, 10);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true // Forzar al usuario a cambiarla al entrar
      }
    });

    // Cierra las sesiones abiertas de ese usuario: los tokens anteriores dejan de ser válidos
    await bumpTokenVersion(id);

    return res.json({
      message: 'Contraseña reseteada con éxito',
      email: targetUser.email,
      name: targetUser.name,
      tempPassword: generatedPass
    });
  } catch (error) {
    console.error('Error reseteando contraseña:', error);
    return res.status(500).json({ error: 'Error al resetear contraseña' });
  }
};

/**
 * Enviar notificación push masiva o individual desde el panel de Admin
 */
const sendCustomNotification = async (req, res) => {
  try {
    const { title, body, targetUserId, url = '/' } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Título y mensaje son requeridos' });
    }

    const payload = {
      title: `📢 ${title}`,
      body,
      url,
      icon: '/icons/icon.svg'
    };

    let result;
    if (targetUserId && targetUserId !== 'ALL') {
      result = await sendPushToUser(targetUserId, payload);
    } else {
      result = await sendBroadcastPush(payload);
    }

    return res.json({
      success: true,
      message: 'Notificación procesada',
      sentCount: result?.sentCount ?? 0,
      failedCount: result?.failedCount ?? 0
    });
  } catch (error) {
    console.error('Error enviando notificación administrativa:', error);
    return res.status(500).json({ error: 'Error al enviar notificación' });
  }
};

/**
 * Estadísticas generales para el administrador
 */
const getAdminStats = async (req, res) => {
  try {
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const inactiveUsers = await prisma.user.count({ where: { isActive: false } });
    const pendingCount = await prisma.reminder.count({ where: { status: 'PENDING' } });
    const completedCount = await prisma.reminder.count({ where: { status: 'COMPLETED' } });
    const dismissedCount = await prisma.reminder.count({ where: { status: 'DISMISSED' } });

    return res.json({
      activeUsers,
      inactiveUsers,
      pendingCount,
      completedCount,
      dismissedCount
    });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    return res.status(500).json({ error: 'Error al obtener métricas' });
  }
};

module.exports = {
  getUsers,
  createUser,
  toggleUserStatus,
  resetUserPassword,
  sendCustomNotification,
  getAdminStats
};
