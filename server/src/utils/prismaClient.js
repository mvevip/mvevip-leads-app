const { PrismaClient } = require('@prisma/client');

// Cliente compartido para el código nuevo (límites de intentos y versión de sesión)
const prisma = new PrismaClient();

module.exports = prisma;
