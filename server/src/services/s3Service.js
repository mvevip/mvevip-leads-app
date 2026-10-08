const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || '';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || '';

let s3Client = null;
if (S3_BUCKET_NAME) {
  s3Client = new S3Client({ region: AWS_REGION });
}

/**
 * Sube un buffer o base64 a S3 en la carpeta /uploads
 */
const uploadToS3 = async (keyPrefix, filename, buffer, contentType) => {
  if (!s3Client || !S3_BUCKET_NAME) {
    return null; // Fallback a almacenamiento local / base64
  }

  const cleanFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const s3Key = `uploads/${keyPrefix ? keyPrefix + '/' : ''}${cleanFilename}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType
  });

  await s3Client.send(command);

  // Si hay dominio CloudFront configurado, devolver la URL limpia de CDN
  if (CLOUDFRONT_DOMAIN) {
    const domain = CLOUDFRONT_DOMAIN.startsWith('http') ? CLOUDFRONT_DOMAIN : `https://${CLOUDFRONT_DOMAIN}`;
    return `${domain}/${s3Key}`;
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

module.exports = {
  uploadToS3,
  uploadBase64Image
};
