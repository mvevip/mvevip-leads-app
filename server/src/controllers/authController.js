const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_mvevip_lead';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '5d';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Esta cuenta ha sido deshabilitada por el administrador.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Inicio de sesión exitoso',
      token,
      expiresIn: JWT_EXPIRES_IN,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        mustChangePassword: user.mustChangePassword,
        isFirstLogin: user.isFirstLogin
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno en autenticación' });
  }
};

/**
 * Cambio obligatorio de contraseña (con opción de actualizar foto y marcar isFirstLogin = false)
 */
const changePassword = async (req, res) => {
  try {
    const { newPassword, avatarUrl } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updateData = {
      passwordHash,
      mustChangePassword: false
    };

    if (avatarUrl) {
      updateData.avatarUrl = normalizeMediaUrl(avatarUrl);
      updateData.isFirstLogin = false;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        mustChangePassword: true,
        isFirstLogin: true
      }
    });

    return res.json({
      message: 'Contraseña y perfil actualizados exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    return res.status(500).json({ error: 'Error interno al cambiar contraseña' });
  }
};

const { uploadBase64Image, normalizeMediaUrl } = require('../services/s3Service');

/**
 * Actualizar avatar del usuario desde el perfil o durante onboarding
 */
const updateAvatar = async (req, res) => {
  try {
    let { avatarUrl } = req.body;

    if (avatarUrl && avatarUrl.startsWith('data:image')) {
      avatarUrl = await uploadBase64Image('avatars', avatarUrl);
    } else if (avatarUrl) {
      avatarUrl = normalizeMediaUrl(avatarUrl); // Si el cliente reenvía una URL firmada, se guarda sin firma
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        avatarUrl: avatarUrl || null,
        isFirstLogin: false
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        isFirstLogin: true
      }
    });

    return res.json({
      message: 'Avatar actualizado con éxito',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando avatar:', error);
    return res.status(500).json({ error: 'Error al actualizar foto' });
  }
};

/**
 * Marcar onboarding completado si omite la foto
 */
const skipFirstLogin = async (req, res) => {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { isFirstLogin: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        isFirstLogin: true
      }
    });

    return res.json({ user: updatedUser });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando estado' });
  }
};

const getProfile = async (req, res) => {
  return res.json({ user: req.user });
};

module.exports = {
  login,
  changePassword,
  updateAvatar,
  skipFirstLogin,
  getProfile
};
