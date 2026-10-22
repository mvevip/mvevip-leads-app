// El secreto JWT es obligatorio: sin valor por defecto en el código, para que nunca se firmen tokens con un secreto conocido
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está configurada en el entorno');
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '5d';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN
};
