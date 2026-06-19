import multer, { StorageEngine } from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { DocumentType } from '@prisma/client';

// ── Almacenamiento de documentos del conductor ────────────────────────────────
//
// Con S3_BUCKET definido, los archivos van a un bucket S3/R2 (persistente). Sin
// él, se guardan en disco local — OJO: el filesystem de Render es EFÍMERO, así
// que en producción los documentos se pierden en cada redeploy. El disco solo
// sirve para desarrollo o un único host con volumen persistente.

const ALLOWED_TYPES: DocumentType[] = [
  DocumentType.CEDULA,
  DocumentType.LICENSE,
  DocumentType.SOAT,
  DocumentType.PROPERTY_CARD,
  DocumentType.PROFILE_PHOTO,
];

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const S3_BUCKET = process.env['S3_BUCKET'];
const useS3 = Boolean(S3_BUCKET);
// Base pública para construir la URL del archivo (bucket público R2 / CDN /
// dominio). Si no se define, se usa la `location` que devuelve el SDK.
const S3_PUBLIC_URL = (process.env['S3_PUBLIC_URL'] ?? '').replace(/\/+$/, '');

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'driver-documents');

// Crea el directorio local solo cuando se usa disco.
if (!useS3 && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Nombre/clave sin PII: timestamp + sufijo aleatorio.
function randomName(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

function buildStorage(): StorageEngine {
  if (useS3) {
    const s3 = new S3Client({
      region: process.env['S3_REGION'] ?? 'auto',
      ...(process.env['S3_ENDPOINT']
        ? { endpoint: process.env['S3_ENDPOINT'], forcePathStyle: true }
        : {}),
      ...(process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_ACCESS_KEY']
        ? {
            credentials: {
              accessKeyId: process.env['S3_ACCESS_KEY_ID'],
              secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'],
            },
          }
        : {}),
    });
    return multerS3({
      s3,
      bucket: S3_BUCKET!,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) =>
        cb(null, `driver-documents/${randomName(file.originalname)}`),
    });
  }
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, randomName(file.originalname)),
  });
}

export const documentUpload = multer({
  storage: buildStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.'));
      return;
    }
    cb(null, true);
  },
});

/**
 * URL pública del archivo subido. Con S3/R2 devuelve la URL del bucket (o
 * `S3_PUBLIC_URL/<key>` si se configuró una base pública); en disco, la ruta
 * `/uploads/...` que sirve Express.
 */
export function fileToUrl(file: Express.Multer.File): string {
  if (useS3) {
    const f = file as Express.Multer.File & { key?: string; location?: string };
    if (S3_PUBLIC_URL && f.key) return `${S3_PUBLIC_URL}/${f.key}`;
    return f.location ?? `${f.key ?? ''}`;
  }
  return `/uploads/driver-documents/${file.filename}`;
}

export { ALLOWED_TYPES, UPLOAD_DIR };
