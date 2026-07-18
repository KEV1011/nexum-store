import { DocumentType, DocumentStatus as PrismaDocumentStatus } from '@prisma/client';
import {
  DriverProfileDTO,
  DriverPublicProfileDTO,
  DriverDocumentDTO,
  DriverDocumentType,
  DocumentStatus,
  UpsertDriverDocumentDTO,
} from '../types';
import { prisma } from '../lib/prisma';
import { pilotSkipVerification } from './kyc.service';

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

  return {
    driverId: driver.id,
    fullName: driver.name,
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
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });
  if (!driver) return null;

  return {
    driverId: driver.id,
    fullName: driver.name,
    photoUrl: driver.avatarUrl ?? undefined,
    bio: driver.bio ?? undefined,
    rating: driver.rating,
    totalTrips: driver.totalTrips,
    vehicleDescription: _vehicleDescription(driver.vehicles[0]),
    memberSince: driver.createdAt.toISOString(),
    isVerified: driver.isVerified,
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
  await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type: docType } },
    update: {
      fileUrl: dto.fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: dto.expiresAt ?? null,
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
      expiresAt: dto.expiresAt ?? null,
    },
  });
  return getDriverProfile(driverId);
}

/** Used by the new POST /driver/documents (multipart; file already saved to disk). */
export async function uploadDriverDocument(
  driverId: string,
  type: DocumentType,
  fileUrl: string,
  expiresAt?: string,
): Promise<DriverProfileDTO> {
  await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type } },
    update: {
      fileUrl,
      status: PrismaDocumentStatus.PENDING,
      expiresAt: expiresAt ?? null,
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
      expiresAt: expiresAt ?? null,
    },
  });
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
    uploadedAt: d.uploadedAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
  }));
}
