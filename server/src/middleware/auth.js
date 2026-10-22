const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { JWT_SECRET } = require('../utils/jwtConfig');
const { getTokenVersion } = require('../utils/sessionVersion');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorización requerido o formato inválido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        mustChangePassword: true,
        isFirstLogin: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario no encontrado o cuenta desactivada' });
    }

    // Sesión revocada (p. ej. el administrador reseteó la contraseña): los tokens anteriores dejan de servir.
    // Si la versión no se puede leer (null) no se invalida ninguna sesión.
    const currentVersion = await getTokenVersion(user.id);
    if (currentVersion !== null && (decoded.tokenVersion ?? 0) !== currentVersion) {
      return res.status(401).json({ error: 'La sesión ya no es válida. Por favor ingrese nuevamente' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'La sesión ha expirado (5 días). Por favor ingrese nuevamente' });
    }
    return res.status(401).json({ error: 'Token no válido' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso restringido: requiere permisos de Administrador' });
  }
};

module.exports = {
  authMiddleware,
  requireAdmin
};
