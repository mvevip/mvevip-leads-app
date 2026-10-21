const crypto = require('crypto');

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignora lo que exceda de 72 bytes

// Sin caracteres ambiguos (0/O, 1/I/L) para que sea fácil de compartir
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEMP_PASSWORD_LENGTH = 8;

/**
 * Devuelve un mensaje de error si la contraseña no cumple la política, o null si es válida.
 */
const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede superar ${MAX_PASSWORD_LENGTH} caracteres`;
  }
  return null;
};

const generateTempPassword = () => {
  let suffix = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    suffix += TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return `MVEVIP${suffix}`;
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  validatePassword,
  generateTempPassword
};
