import multer, { StorageEngine } from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

// Crea el directorio local solo cuando se usa disco. Nunca debe tumbar el
// arranque del servidor: sin S3 configurado, un permiso de escritura faltante
// (contenedor con usuario sin privilegios, disco de solo lectura, etc.) solo
// debe romper la subida de documentos, no todo el backend.
if (!useS3 && !fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error(
      `[upload] No se pudo crear ${UPLOAD_DIR} (subida de documentos a disco deshabilitada): ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
}

// Nombre/clave sin PII: timestamp + sufijo aleatorio.
function randomName(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

/**
 * Cliente S3/R2 con la configuración del entorno. `forcePathStyle` con endpoint
 * propio es lo que exigen R2 y los S3 compatibles.
 */
function buildS3Client(): S3Client {
  return new S3Client({
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
}

function buildStorage(): StorageEngine {
  if (useS3) {
    const s3 = buildS3Client();
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

// ── Diagnóstico real del almacenamiento ───────────────────────────────────────
// /health solo mira si S3_BUCKET está definido: unas llaves mal copiadas o un
// bucket sin acceso público darían igual "s3-r2" y fallarían al subir. Esta
// sonda ESCRIBE un objeto, comprueba que se lea por la URL pública y lo borra.

export interface UploadsProbe {
  /** 's3-r2' | 'disco-efimero' — el modo configurado. */
  mode: string;
  /** 'ok' o el error de escritura (llaves/endpoint/bucket incorrectos). */
  write: string;
  /** 'ok', el error de lectura pública, o por qué no se pudo comprobar. */
  publicRead: string;
  /** Resumen accionable en español. */
  veredicto: string;
  /** Config visible (SIN llaves) para detectar erratas de un vistazo. */
  config: string;
}

/**
 * Traduce el error de escritura a la causa real. "Invalid URL" NO es un
 * problema de permisos: es el SDK fallando al parsear S3_ENDPOINT (lo más
 * común: pegarlo sin el `https://`).
 */
function explainS3WriteError(msg: string): string {
  if (/invalid url/i.test(msg)) {
    return 'S3_ENDPOINT está mal formado. Debe ser una URL COMPLETA con esquema: ' +
      'https://<ACCOUNT_ID>.r2.cloudflarestorage.com (sin el nombre del bucket al final, ' +
      'sin espacios ni comillas). Es el fallo más común al pegarlo desde Cloudflare.';
  }
  if (/credential|signature|access denied|forbidden|401|403/i.test(msg)) {
    return 'El bucket rechaza las credenciales. Revisa S3_ACCESS_KEY_ID / ' +
      'S3_SECRET_ACCESS_KEY y que el token de R2 tenga permiso Object Read & Write.';
  }
  if (/no such bucket|not found|404/i.test(msg)) {
    return 'El bucket no existe con ese nombre. Revisa S3_BUCKET (debe ser el nombre exacto ' +
      'del bucket en R2, no la URL).';
  }
  if (/eproto|ssl|handshake|tls|certificate/i.test(msg)) {
    return 'El endpoint responde pero rechaza la conexión segura: casi siempre significa que ' +
      'el ACCOUNT_ID del host no es el tuyo. Copia tu Account ID real desde Cloudflare ' +
      '(R2 → Overview → Account details) y ponlo en S3_ENDPOINT: ' +
      'https://TU_ACCOUNT_ID.r2.cloudflarestorage.com';
  }
  if (/getaddrinfo|enotfound|econnrefused|timeout/i.test(msg)) {
    return 'No se pudo contactar el endpoint: ese host no existe. Comprueba que el ACCOUNT_ID ' +
      'de S3_ENDPOINT sea el tuyo (Cloudflare → R2 → Overview → Account details), no un ejemplo.';
  }
  if (/deserial|is not expected/i.test(msg)) {
    return 'El endpoint respondió algo que no es una API S3 (probablemente una página web). ' +
      'Revisa S3_ENDPOINT: debe ser https://TU_ACCOUNT_ID.r2.cloudflarestorage.com, no la ' +
      'URL pública del bucket ni el panel de Cloudflare.';
  }
  return 'No se pudo escribir en el bucket. Revisa S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, ' +
    'S3_ENDPOINT y que el token tenga permiso de Object Read & Write.';
}

/** Config de almacenamiento visible en el diagnóstico. Nunca incluye llaves. */
function describeS3Config(): string {
  const endpoint = process.env['S3_ENDPOINT'] ?? '';
  let endpointEstado: string;
  if (!endpoint) {
    endpointEstado = 'sin definir (se usaría AWS S3)';
  } else {
    try {
      const u = new URL(endpoint);
      // Valores de ejemplo copiados literalmente de una guía: el host no existe
      // y el fallo aparece tarde (error TLS), difícil de relacionar con esto.
      endpointEstado = /abc123|<|TU_ACCOUNT_ID|ACCOUNT_ID|ejemplo|example/i.test(u.host)
        ? `${u.protocol}//${u.host} ← ¡ES UN EJEMPLO! pon tu Account ID real de Cloudflare`
        : `${u.protocol}//${u.host}`;
    } catch {
      endpointEstado = `INVÁLIDO ("${endpoint}") — falta https:// o sobra algo`;
    }
  }
  const publicUrl = S3_PUBLIC_URL || 'sin definir';
  const claves =
    process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_ACCESS_KEY']
      ? 'definidas'
      : 'FALTAN';
  return (
    `bucket: ${S3_BUCKET ?? '—'} · endpoint: ${endpointEstado} · ` +
    `region: ${process.env['S3_REGION'] ?? 'auto'} · llaves: ${claves} · público: ${publicUrl}`
  );
}

export async function probeUploads(): Promise<UploadsProbe> {
  if (!useS3) {
    return {
      mode: 'disco-efimero',
      write: 'no aplica',
      publicRead: 'no aplica',
      veredicto:
        'Sin S3_BUCKET: los archivos van al disco EFÍMERO de Render y se pierden en cada redeploy.',
      config: describeS3Config(),
    };
  }

  const key = `_diagnostics/probe-${Date.now()}.txt`;
  const s3 = buildS3Client();

  let write = 'ok';
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: key,
        Body: 'zipa-probe',
        ContentType: 'text/plain',
      }),
    );
  } catch (err) {
    write = err instanceof Error ? err.message : String(err);
    return {
      mode: 's3-r2',
      write,
      publicRead: 'no comprobado (falló la escritura)',
      veredicto: explainS3WriteError(write),
      config: describeS3Config(),
    };
  }

  // Lectura pública: es lo que falla cuando el bucket no tiene habilitado el
  // acceso público (la subida funciona, pero las fotos no se ven).
  let publicRead: string;
  if (!S3_PUBLIC_URL) {
    publicRead = 'sin S3_PUBLIC_URL definido';
  } else {
    try {
      const res = await fetch(`${S3_PUBLIC_URL}/${key}`);
      publicRead = res.ok ? 'ok' : `HTTP ${res.status}`;
    } catch (err) {
      publicRead = err instanceof Error ? err.message : String(err);
    }
  }

  // Limpieza best-effort: el objeto de prueba no debe quedarse en el bucket.
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET!, Key: key }));
  } catch {
    /* si no se pudo borrar, no es motivo para fallar el diagnóstico */
  }

  const ok = write === 'ok' && publicRead === 'ok';
  return {
    mode: 's3-r2',
    write,
    publicRead,
    veredicto: ok
      ? 'Almacenamiento permanente OK: se escribió y se leyó públicamente un objeto de prueba.'
      : publicRead === 'sin S3_PUBLIC_URL definido'
        ? 'Se escribe bien, pero falta S3_PUBLIC_URL para construir las URL públicas de las fotos.'
        : 'Se escribe bien, pero el objeto NO se lee por la URL pública: habilita el acceso ' +
          'público del bucket (R2 → Settings → Public Development URL) y revisa S3_PUBLIC_URL.',
    config: describeS3Config(),
  };
}

export { ALLOWED_TYPES, UPLOAD_DIR };
