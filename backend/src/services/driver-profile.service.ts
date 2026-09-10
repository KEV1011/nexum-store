import { DocumentType, DocumentStatus as PrismaDocumentStatus, Prisma } from '@prisma/client';
import {
  DriverProfileDTO,
  DriverPublicProfileDTO,
  DriverDocumentDTO,
  DriverDocumentType,
  DocumentStatus,
  UpsertDriverDocumentDTO,
} from '../types';
import { prisma } from '../lib/prisma';
import { verificacionesDeConductor } from '../lib/verificaciones-conductor';
import { cuentaElogios } from '../lib/elogios';
import { pilotSkipVerification } from './kyc.service';
import { evaluateDriverCompliance } from './document-expiry.service';
import { runDocumentOcr } from './ocr.service';

// ─────────────────────────────────────────────────────────────────────────────
// Driver profile & document verification (Features D + E)
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_DOCS: DocumentType[] = [
  DocumentType.CEDULA,
  DocumentType.LICENSE,
  DocumentType.SOAT,
  DocumentType.PROPERTY_CARD,
];

const DOC_LABELS: Record<DocumentType, string> = {
  CEDULA: 'Cédula de ciudadanía',
  LICENSE: 'Licencia de conducción',
  SOAT: 'SOAT vigente',
  PROPERTY_CARD: 'Tarjeta de propiedad',
  PROFILE_PHOTO: 'Foto de perfil',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

type DbDoc = {
  id: string;
  type: DocumentType;
  fileUrl: string;
  status: PrismaDocumentStatus;
  expiresAt: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  uploadedAt: Date;
  reviewedAt: Date | null;
};

function _dbDocToDTO(doc: DbDoc): DriverDocumentDTO {
  return {
    type: doc.type as DriverDocumentType,
    label: DOC_LABELS[doc.type] ?? doc.type,
    fileUrl: doc.fileUrl,
    status: doc.status as DocumentStatus,
    expiresAt: doc.expiresAt ?? undefined,
    rejectionReason: doc.rejectionReason ?? undefined,
    uploadedAt: doc.uploadedAt.toISOString(),
    reviewedAt: doc.reviewedAt?.toISOString(),
  };
}

function _buildDocList(docs: DbDoc[]): DriverDocumentDTO[] {
  const docMap = new Map(docs.map((d) => [d.type, d]));
  return REQUIRED_DOCS.map((t) => {
    const existing = docMap.get(t);
    if (existing) return _dbDocToDTO(existing);
    return {
      type: t as DriverDocumentType,
      label: DOC_LABELS[t],
      fileUrl: '',
      status: 'missing' as DocumentStatus,
      uploadedAt: '',
    };
  });
}

function _vehicleDescription(
  vehicle: { brand: string; model: string; color: string; plate: string } | null | undefined,
): string {
  if (!vehicle) return 'Vehículo sin registrar';
  return `${vehicle.brand} ${vehicle.model} ${vehicle.color} • ${vehicle.plate}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function isDriverVerified(driverId: string): Promise<boolean> {
  // Piloto: se salta la verificación para recibir despacho (default off).
  if (pilotSkipVerification()) return true;
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { isVerified: true },
  });
  return driver?.isVerified ?? false;
}

export async function getDriverProfile(driverId: string): Promise<DriverProfileDTO> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      vehicles: { where: { isActive: true }, take: 1 },
      documents: true,
      operator: { select: { id: true, legalName: true, type: true, status: true, isVerified: true } },
    },
  });
  if (!driver) throw new Error('Driver not found');

  const docs = _buildDocList(driver.documents as DbDoc[]);
  const approvedCount = docs.filter((d) => d.status === 'APPROVED').length;
  const vehicle = driver.vehicles[0];

  // Lo que sus pasajeros destacan. Para él es la parte útil de la
  // calificación: un 4,8 no le enseña nada, y «tres pasajeros dicen que llegas
  // puntual» sí le dice qué está haciendo bien y qué conviene repetir.
  const elogios = cuentaElogios(
    (
      await prisma.trip.findMany({
        where: { driverId, ratingTags: { not: Prisma.DbNull } },
        select: { ratingTags: true },
      })
    ).map((t) => (Array.isArray(t.ratingTags) ? (t.ratingTags as string[]) : null)),
  );

  return {
    driverId: driver.id,
    fullName: driver.name,
    elogios,
    phone: driver.phone,
    photoUrl: driver.avatarUrl ?? undefined,
    bio: driver.bio ?? undefined,
    rating: driver.rating,
    totalTrips: driver.totalTrips,
    vehicleDescription: _vehicleDescription(vehicle),
    vehicleBrand: vehicle?.brand,
    vehicleModel: vehicle?.model,
    vehicleYear: vehicle?.year,
    vehiclePlate: vehicle?.plate,
    vehicleColor: vehicle?.color,
    vehicleType: vehicle?.type,
    documentNumber: driver.documentNumber ?? undefined,
    bankName: driver.bankName ?? undefined,
    bankAccountType: driver.bankAccountType ?? undefined,
    bankAccountNumber: driver.bankAccountNumber ?? undefined,
    memberSince: driver.createdAt.toISOString(),
    isVerified: driver.isVerified,
    verificationRequired: !pilotSkipVerification(),
    complianceStatus: driver.complianceStatus,
    blockedReason: driver.blockedReason ?? undefined,
    documents: docs,
    requiredDocsCount: REQUIRED_DOCS.length,
    approvedDocsCount: approvedCount,
    affiliation: driver.operator
      ? {
          operatorId: driver.operator.id,
          legalName: driver.operator.legalName,
          type: driver.operator.type,
          status: driver.operator.status,
          isVerified: driver.operator.isVerified,
          employmentType: driver.employmentType ?? 'AFFILIATED',
        }
      : undefined,
  };
}

export async function getDriverPublicProfile(driverId: string): Promise<DriverPublicProfileDTO | null> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      vehicles: { where: { isActive: true }, take: 1 },
      documents: { select: { type: true, status: true, expiresAt: true } },
    },
  });
  if (!driver) return null;

  // Las verificaciones que el pasajero mira antes de subirse. Los datos ya
  // estaban guardados —KYC, antecedentes, documentos, foto— y no los veía
  // nadie. La regla de qué cuenta como verificado vive suelta y probada en
  // `lib/verificaciones-conductor`, porque es donde es fácil mentir sin querer:
  // un SOAT aprobado el año pasado y ya vencido NO es «SOAT vigente».
  const verificaciones = verificacionesDeConductor({
    kycStatus: driver.kycStatus,
    backgroundStatus: driver.backgroundStatus,
    tieneFotoDePerfil: Boolean(driver.avatarUrl),
    tieneSelfie: Boolean(driver.selfieUrl),
    documentos: driver.documents.map((d) => ({
      tipo: d.type,
      estado: d.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      venceEl: d.expiresAt,
    })),
  });

  // Los elogios se RECALCULAN de los viajes, nunca se suman encima de un
  // contador: un acumulado y unas filas acaban discrepando y nadie sabe cuál
  // miente. Es la misma regla que ya siguen la nota del conductor y la del
  // negocio.
  const calificados = await prisma.trip.findMany({
    where: { driverId, ratingTags: { not: Prisma.DbNull } },
    select: { ratingTags: true },
  });
  const elogios = cuentaElogios(
    calificados.map((t) => (Array.isArray(t.ratingTags) ? (t.ratingTags as string[]) : null)),
  );

  return {
    driverId: driver.id,
    fullName: driver.name,
    photoUrl: driver.avatarUrl ?? undefined,
    bio: driver.bio ?? undefined,
    rating: driver.rating,
    // Un 4,9 con dos votos y otro con doscientos no son la misma información.
    ratingCount: driver.ratingCount,
    totalTrips: driver.totalTrips,
    vehicleDescription: _vehicleDescription(driver.vehicles[0]),
    memberSince: driver.createdAt.toISOString(),
    isVerified: driver.isVerified,
    citySlug: driver.citySlug ?? undefined,
    elogios,
    verificaciones: verificaciones.items,
    verificacionesCumplidas: verificaciones.cumplidas,
    verificacionesTotal: verificaciones.total,
  };
}

export async function updateDriverProfile(
  driverId: string,
  patch: { fullName?: string; bio?: string; photoUrl?: string; vehicleDescription?: string },
): Promise<DriverProfileDTO> {
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      ...(patch.fullName !== undefined && { name: patch.fullName }),
      ...(patch.bio !== undefined && { bio: patch.bio }),
      ...(patch.photoUrl !== undefined && { avatarUrl: patch.photoUrl }),
    },
  });
  return getDriverProfile(driverId);
}

/** Used by the legacy PUT /driver/documents (JSON body with fileUrl). */
export async function upsertDriverDocument(
  driverId: string,
  dto: UpsertDriverDocumentDTO,
): Promise<DriverProfileDTO> {
  const docType = dto.type as DocumentType;
  // OCR env-gated: con proveedor extrae número/nombre/vencimiento (autollenar
  // expiresAt solo si el conductor no lo escribió); sin proveedor es no-op.
  const ocr = await runDocumentOcr(driverId, docType, dto.fileUrl, dto.expiresAt);
  await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type: docType } },
    update: {
      fileUrl: dto.fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: ocr.expiresAt,
      ocrFields: ocr.ocrFields,
      ocrConfidence: ocr.ocrConfidence,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      uploadedAt: new Date(),
    },
    create: {
      driverId,
      type: docType,
      fileUrl: dto.fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: ocr.expiresAt,
      ocrFields: ocr.ocrFields,
      ocrConfidence: ocr.ocrConfidence,
    },
  });
  // Renovar un documento vencido levanta el kill-switch (el doc pasa a PENDING
  // y deja de contar como "aprobado y vencido"); el admin re-revisa después.
  await evaluateDriverCompliance(driverId);
  return getDriverProfile(driverId);
}

/** Used by the new POST /driver/documents (multipart; file already saved to disk). */
export async function uploadDriverDocument(
  driverId: string,
  type: DocumentType,
  fileUrl: string,
  expiresAt?: string,
): Promise<DriverProfileDTO> {
  // OCR env-gated (ver upsert de arriba): autollenado de expiresAt + campos
  // extraídos para la revisión del admin. No-op sin proveedor.
  const ocr = await runDocumentOcr(driverId, type, fileUrl, expiresAt);
  await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type } },
    update: {
      fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: ocr.expiresAt,
      ocrFields: ocr.ocrFields,
      ocrConfidence: ocr.ocrConfidence,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      uploadedAt: new Date(),
    },
    create: {
      driverId,
      type,
      fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: ocr.expiresAt,
      ocrFields: ocr.ocrFields,
      ocrConfidence: ocr.ocrConfidence,
    },
  });
  // Renovar un documento vencido levanta el kill-switch (ver upsert de arriba).
  await evaluateDriverCompliance(driverId);
  return getDriverProfile(driverId);
}

/** Used by admin approve/reject endpoints. */
export async function adminReviewDocument(
  docId: string,
  approve: boolean,
  reviewedBy: string,
  rejectionReason?: string,
): Promise<DriverProfileDTO | null> {
  const doc = await prisma.driverDocument.findUnique({ where: { id: docId } });
  if (!doc) return null;

  await prisma.driverDocument.update({
    where: { id: docId },
    data: {
      status: approve ? PrismaDocumentStatus.APPROVED : PrismaDocumentStatus.REJECTED,
      rejectionReason: approve ? null : (rejectionReason ?? null),
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  await _syncIsVerified(doc.driverId);
  // La aprobación (con nueva fecha) o el rechazo cambian el cumplimiento.
  await evaluateDriverCompliance(doc.driverId);
  return getDriverProfile(doc.driverId);
}

export async function reviewDriverDocument(
  driverId: string,
  type: DriverDocumentType,
  approve: boolean,
  rejectionReason?: string,
): Promise<DriverProfileDTO | null> {
  const doc = await prisma.driverDocument.findUnique({
    where: { driverId_type: { driverId, type: type as DocumentType } },
  });
  if (!doc) return null;

  await prisma.driverDocument.update({
    where: { id: doc.id },
    data: {
      status: approve ? PrismaDocumentStatus.APPROVED : PrismaDocumentStatus.REJECTED,
      rejectionReason: approve ? null : (rejectionReason ?? null),
      reviewedAt: new Date(),
    },
  });

  await _syncIsVerified(driverId);
  // La aprobación (con nueva fecha) o el rechazo cambian el cumplimiento.
  await evaluateDriverCompliance(driverId);
  return getDriverProfile(driverId);
}

async function _syncIsVerified(driverId: string): Promise<void> {
  const approvedCount = await prisma.driverDocument.count({
    where: {
      driverId,
      type: { in: REQUIRED_DOCS },
      status: PrismaDocumentStatus.APPROVED,
    },
  });
  await prisma.driver.update({
    where: { id: driverId },
    data: { isVerified: approvedCount >= REQUIRED_DOCS.length },
  });
}

// ─── Admin listing helpers ────────────────────────────────────────────────────

export interface AdminDocumentItem {
  docId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  type: DocumentType;
  label: string;
  fileUrl: string;
  status: PrismaDocumentStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  /** Campos extraídos por OCR (JSON string) + confianza, si hubo proveedor. */
  ocrFields: string | null;
  ocrConfidence: number | null;
  /** Fecha de vencimiento del documento (autollenada por OCR si aplica). */
  expiresAt: string | null;
}

export async function listDocumentsForAdmin(
  status?: PrismaDocumentStatus,
): Promise<AdminDocumentItem[]> {
  const docs = await prisma.driverDocument.findMany({
    where: status ? { status } : undefined,
    include: { driver: { select: { name: true, phone: true } } },
    orderBy: { uploadedAt: 'asc' },
  });

  return docs.map((d) => ({
    docId: d.id,
    driverId: d.driverId,
    driverName: d.driver.name,
    driverPhone: d.driver.phone,
    type: d.type,
    label: DOC_LABELS[d.type] ?? d.type,
    fileUrl: d.fileUrl,
    status: d.status,
    rejectionReason: d.rejectionReason,
    reviewedBy: d.reviewedBy,
    ocrFields: d.ocrFields,
    ocrConfidence: d.ocrConfidence,
    expiresAt: d.expiresAt,
    uploadedAt: d.uploadedAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
  }));
}

/**
 * Los datos que hacen falta para explicarle a un conductor por qué no puede
 * conectarse (ver `lib/bloqueo-conductor`).
 *
 * Vive aquí porque `REQUIRED_DOCS` y `DOC_LABELS` viven aquí: si el guard
 * tuviera su propia lista de documentos obligatorios, tarde o temprano diría
 * que falta uno que ya no se pide, o callaría uno nuevo.
 */
export async function getEstadoHabilitacion(driverId: string): Promise<{
  documentosFaltantes: string[];
  documentosRechazados: Array<{ label: string; motivo: string | null }>;
} | null> {
  const docs = await prisma.driverDocument.findMany({
    where: { driverId, type: { in: REQUIRED_DOCS } },
    select: { type: true, status: true, rejectionReason: true },
  });
  const porTipo = new Map(docs.map((d) => [d.type, d]));

  const faltantes: string[] = [];
  const rechazados: Array<{ label: string; motivo: string | null }> = [];
  for (const t of REQUIRED_DOCS) {
    const d = porTipo.get(t);
    const label = DOC_LABELS[t] ?? t;
    if (!d || d.status === PrismaDocumentStatus.PENDING) {
      faltantes.push(label);
    } else if (d.status === PrismaDocumentStatus.REJECTED) {
      rechazados.push({ label, motivo: d.rejectionReason ?? null });
    }
  }
  return { documentosFaltantes: faltantes, documentosRechazados: rechazados };
}
