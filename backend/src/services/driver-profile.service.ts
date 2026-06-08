import {
  DriverProfileDTO,
  DriverPublicProfileDTO,
  DriverDocumentDTO,
  DriverDocumentType,
  DocumentStatus,
  UpsertDriverDocumentDTO,
} from '../types';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Driver profile & document verification (Features D + E)
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_DOCS: DriverDocumentType[] = [
  'cedula',
  'license',
  'soat',
  'vehicle_registration',
];

const DOC_LABELS: Record<DriverDocumentType, string> = {
  cedula: 'Cédula de ciudadanía',
  license: 'Licencia de conducción',
  soat: 'SOAT vigente',
  vehicle_registration: 'Tarjeta de propiedad',
  profile_photo: 'Foto de perfil',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

type DbDoc = {
  type: string;
  fileUrl: string;
  status: string;
  expiresAt: string | null;
  rejectionReason: string | null;
  uploadedAt: Date;
  reviewedAt: Date | null;
};

function _dbDocToDTO(doc: DbDoc): DriverDocumentDTO {
  return {
    type: doc.type as DriverDocumentType,
    label: DOC_LABELS[doc.type as DriverDocumentType] ?? doc.type,
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
      type: t,
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
    },
  });
  if (!driver) throw new Error('Driver not found');

  const docs = _buildDocList(driver.documents);
  const approvedCount = docs.filter((d) => d.status === 'approved').length;

  return {
    driverId: driver.id,
    fullName: driver.name,
    phone: driver.phone,
    photoUrl: driver.avatarUrl ?? undefined,
    bio: driver.bio ?? undefined,
    rating: driver.rating,
    totalTrips: driver.totalTrips,
    vehicleDescription: _vehicleDescription(driver.vehicles[0]),
    memberSince: driver.createdAt.toISOString(),
    isVerified: driver.isVerified,
    documents: docs,
    requiredDocsCount: REQUIRED_DOCS.length,
    approvedDocsCount: approvedCount,
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
      // vehicleDescription is a computed field from Vehicle; no direct DB column
    },
  });
  return getDriverProfile(driverId);
}

export async function upsertDriverDocument(
  driverId: string,
  dto: UpsertDriverDocumentDTO,
): Promise<DriverProfileDTO> {
  await prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type: dto.type } },
    update: {
      fileUrl: dto.fileUrl,
      status: 'pending',
      expiresAt: dto.expiresAt ?? null,
      rejectionReason: null,
      reviewedAt: null,
      uploadedAt: new Date(),
    },
    create: {
      driverId,
      type: dto.type,
      fileUrl: dto.fileUrl,
      status: 'pending',
      expiresAt: dto.expiresAt ?? null,
    },
  });
  return getDriverProfile(driverId);
}

export async function reviewDriverDocument(
  driverId: string,
  type: DriverDocumentType,
  approve: boolean,
  rejectionReason?: string,
): Promise<DriverProfileDTO | null> {
  const doc = await prisma.driverDocument.findUnique({
    where: { driverId_type: { driverId, type } },
  });
  if (!doc) return null;

  await prisma.driverDocument.update({
    where: { id: doc.id },
    data: {
      status: approve ? 'approved' : 'rejected',
      rejectionReason: approve ? null : (rejectionReason ?? null),
      reviewedAt: new Date(),
    },
  });

  // Sync isVerified: all required docs must be approved
  const approvedCount = await prisma.driverDocument.count({
    where: { driverId, type: { in: REQUIRED_DOCS }, status: 'approved' },
  });
  await prisma.driver.update({
    where: { id: driverId },
    data: { isVerified: approvedCount >= REQUIRED_DOCS.length },
  });

  return getDriverProfile(driverId);
}
