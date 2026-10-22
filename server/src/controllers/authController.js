const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../utils/jwtConfig');
const { getTokenVersion } = require('../utils/sessionVersion');
const { validatePassword } = require('../utils/passwords');
const { hashKey, countEvents, recordEvent, clearEvents } = require('../utils/rateLimit');
const { getClientIp } = require('../utils/clientIp');
const { logWarn } = require('../utils/logger');

// Límite de intentos fallidos de login: por correo + IP, y un tope general por IP (holgado, contra barridos de correos)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES_PER_EMAIL = 5;
const LOGIN_MAX_FAILURES_PER_IP = 50;

// Hash válido de una contraseña aleatoria: se compara cuando el correo no existe para que el tiempo de respuesta
// no revele si el usuario existe
const DUMMY_PASSWORD_HASH = '$2b$10$1oarJf28zxP5E.dALcJJUu/3alur/V3GFQRhiYgTmPheF8R0TOQHa';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);
    const emailBucket = hashKey('login', normalizedEmail, clientIp);
    const ipBucket = hashKey('login-ip', clientIp);

    const [emailFailures, ipFailures] = await Promise.all([
      countEvents(emailBucket, LOGIN_WINDOW_MS),
      countEvents(ipBucket, LOGIN_WINDOW_MS)
    ]);
    if (emailFailures >= LOGIN_MAX_FAILURES_PER_EMAIL || ipFailures >= LOGIN_MAX_FAILURES_PER_IP) {
      logWarn('login_rate_limited', { ip: clientIp, emailFailures, ipFailures });
      res.set('Retry-After', String(LOGIN_WINDOW_MS / 1000));
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    const isMatch = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
    if (!user || !isMatch) {
      await recordEvent(emailBucket, ipBucket);
      logWarn('login_failed', { ip: clientIp });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // La cuenta deshabilitada se informa solo con la contraseña correcta (no se revela a quien no la conoce)
    if (!user.isActive) {
      return res.status(403).json({ error: 'Esta cuenta ha sido deshabilitada por el administrador.' });
    }

    if (emailFailures > 0) {
      await clearEvents(emailBucket);
    }

    const tokenVersion = (await getTokenVersion(user.id, { fresh: true })) ?? 0;
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, tokenVersion },
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

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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
