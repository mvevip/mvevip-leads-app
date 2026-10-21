const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || '';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || '';

// Credenciales estáticas opcionales (usuario IAM de solo lectura sobre uploads/*) para firmar URLs.
// Con las credenciales temporales del rol de Lambda, una URL firmada deja de funcionar cuando esas
// credenciales expiran (antes que SIGNED_URL_TTL_SECONDS). Con credenciales estáticas dura el TTL completo.
const MEDIA_SIGNER_ACCESS_KEY_ID = process.env.MEDIA_SIGNER_ACCESS_KEY_ID || '';
const MEDIA_SIGNER_SECRET_ACCESS_KEY = process.env.MEDIA_SIGNER_SECRET_ACCESS_KEY || '';

// La fecha de firma se redondea a la hora para que la URL no cambie en cada respuesta y el navegador pueda
// guardar en caché. Se firma con 25 h de vigencia desde esa fecha: al entregarla quedan siempre entre 24 y 25 h.
const SIGNED_URL_TTL_SECONDS = 25 * 60 * 60;
const SIGNED_URL_CACHE_CONTROL = 'private, max-age=86400';
const SIGNING_BUCKET_MS = 60 * 60 * 1000;

let s3Client = null;
let signerClient = null;
if (S3_BUCKET_NAME) {
  s3Client = new S3Client({ region: AWS_REGION });
  signerClient = (MEDIA_SIGNER_ACCESS_KEY_ID && MEDIA_SIGNER_SECRET_ACCESS_KEY)
    ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: MEDIA_SIGNER_ACCESS_KEY_ID,
        secretAccessKey: MEDIA_SIGNER_SECRET_ACCESS_KEY
      }
    })
    : s3Client;
}

const getCloudFrontBase = () => {
  if (!CLOUDFRONT_DOMAIN) return '';
  return CLOUDFRONT_DOMAIN.startsWith('http') ? CLOUDFRONT_DOMAIN : `https://${CLOUDFRONT_DOMAIN}`;
};

/**
 * Sube un buffer o base64 a S3 en la carpeta /uploads.
 * La clave usa un UUID aleatorio (no adivinable); solo se conserva la extensión del archivo original.
 */
const uploadToS3 = async (keyPrefix, filename, buffer, contentType) => {
  if (!s3Client || !S3_BUCKET_NAME) {
    return null; // Fallback a almacenamiento local / base64
  }

  const extension = path.extname(filename || '').replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  const s3Key = `uploads/${keyPrefix ? keyPrefix + '/' : ''}${crypto.randomUUID()}${extension}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType
  });

  await s3Client.send(command);

  // Si hay dominio CloudFront configurado, se guarda la URL con ese dominio (formato canónico en la base de datos).
  // Esa URL no es de acceso público: al responder al cliente se reemplaza por una URL firmada (ver signMediaUrl).
  const cloudFrontBase = getCloudFrontBase();
  if (cloudFrontBase) {
    return `${cloudFrontBase}/${s3Key}`;
  }

  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
};

/**
 * Sube una imagen base64 a S3 si el bucket está activo
 */
const uploadBase64Image = async (keyPrefix, base64String) => {
  if (!base64String || !s3Client || !S3_BUCKET_NAME) {
    return base64String; // Mantener base64 original si S3 no está configurado
  }

  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return base64String;
  }

  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = contentType.split('/')[1] || 'png';
  const filename = `avatar.${ext}`;

  try {
    const url = await uploadToS3(keyPrefix, filename, buffer, contentType);
    return url || base64String;
  } catch (err) {
    console.error('Error subiendo imagen a S3:', err);
    return base64String; // Fallback a base64
  }
};

/**
 * Devuelve la clave S3 (uploads/...) si la URL apunta a un archivo propio (dominio CloudFront o del bucket);
 * null en cualquier otro caso (data URIs, URLs externas, rutas fuera de uploads/).
 */
const extractOwnedKey = (url) => {
  if (!S3_BUCKET_NAME || typeof url !== 'string' || url.length > 2048 || !/^https:\/\//i.test(url)) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return null;
  }

  const ownedHosts = [`${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`];
  const cloudFrontBase = getCloudFrontBase();
  if (cloudFrontBase) ownedHosts.push(new URL(cloudFrontBase).host);
  if (!ownedHosts.includes(parsed.host)) {
    return null;
  }

  let key;
  try {
    key = decodeURIComponent(parsed.pathname.slice(1));
  } catch (err) {
    return null;
  }

  return key.startsWith('uploads/') && !key.includes('..') ? key : null;
};

const signedUrlCache = new Map();
let signedUrlCacheBucket = 0;

/**
 * Reemplaza una URL de uploads/ por una URL firmada de S3 con vigencia de 24 h como mínimo.
 * Cualquier otro valor (null, base64, URL externa) se devuelve sin cambios.
 */
const signMediaUrl = async (url) => {
  const key = extractOwnedKey(url);
  if (!key || !signerClient) {
    return url;
  }

  const bucket = Math.floor(Date.now() / SIGNING_BUCKET_MS);
  if (bucket !== signedUrlCacheBucket) {
    signedUrlCache.clear();
    signedUrlCacheBucket = bucket;
  }
  if (signedUrlCache.has(key)) {
    return signedUrlCache.get(key);
  }

  const signed = await getSignedUrl(
    signerClient,
    new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      ResponseCacheControl: SIGNED_URL_CACHE_CONTROL
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS, signingDate: new Date(bucket * SIGNING_BUCKET_MS) }
  );
  signedUrlCache.set(key, signed);
  return signed;
};

/**
 * Convierte una URL propia (posiblemente firmada, con query string) a su formato canónico sin firma,
 * para no guardar nunca en la base de datos un enlace que vence. Otros valores se devuelven sin cambios.
 */
const normalizeMediaUrl = (url) => {
  const key = extractOwnedKey(url);
  if (!key) {
    return url;
  }

  const cloudFrontBase = getCloudFrontBase();
  return cloudFrontBase
    ? `${cloudFrontBase}/${key}`
    : `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

module.exports = {
  uploadToS3,
  uploadBase64Image,
  signMediaUrl,
  normalizeMediaUrl
};
