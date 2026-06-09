import multer, { StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';
import { DocumentType } from '@prisma/client';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'driver-documents');

// Ensure the upload directory exists at startup.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_TYPES: DocumentType[] = [
  DocumentType.CEDULA,
  DocumentType.LICENSE,
  DocumentType.SOAT,
  DocumentType.PROPERTY_CARD,
  DocumentType.PROFILE_PHOTO,
];

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    // Use timestamp + random suffix — no PII in filename.
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

export const documentUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.'));
      return;
    }
    cb(null, true);
  },
});

/** Returns the public URL path for a stored file (served by /uploads route). */
export function fileToUrl(filename: string): string {
  return `/uploads/driver-documents/${filename}`;
}

export { ALLOWED_TYPES, UPLOAD_DIR };
