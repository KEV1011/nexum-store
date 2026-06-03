import {
  DriverProfileDTO,
  DriverPublicProfileDTO,
  DriverDocumentDTO,
  DriverDocumentType,
  DocumentStatus,
  UpsertDriverDocumentDTO,
} from '../types';
import { MOCK_DRIVER } from '../config/constants';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Driver profile & document verification (Features D + E)
//
// D — drivers upload required legal documents (cédula, licencia, SOAT, tarjeta
//     de propiedad). Each has a verification status. A driver is "verified" and
//     allowed to receive rides only when every required document is approved.
// E — passengers fetch a public profile (name, photo, rating, vehicle, verified
//     badge) before accepting a bid.
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

interface DriverDocument {
  type: DriverDocumentType;
  fileUrl: string;
  status: DocumentStatus;
  expiresAt?: string;
  rejectionReason?: string;
  uploadedAt: Date;
  reviewedAt?: Date;
}

interface DriverProfile {
  driverId: string;
  fullName: string;
  phone: string;
  photoUrl?: string;
  bio?: string;
  rating: number;
  totalTrips: number;
  vehicleDescription: string;
  memberSince: Date;
  documents: Map<DriverDocumentType, DriverDocument>;
}

const profileStore = new Map<string, DriverProfile>();

// ─── Seed the demo driver so the flow is explorable out of the box ─────────────

function seedDemoDriver(): DriverProfile {
  const now = new Date();
  const docs = new Map<DriverDocumentType, DriverDocument>();
  for (const t of REQUIRED_DOCS) {
    docs.set(t, {
      type: t,
      fileUrl: `mock://docs/${MOCK_DRIVER.id}/${t}.jpg`,
      status: 'approved',
      uploadedAt: now,
      reviewedAt: now,
    });
  }
  const profile: DriverProfile = {
    driverId: MOCK_DRIVER.id,
    fullName: MOCK_DRIVER.name,
    phone: MOCK_DRIVER.phone,
    photoUrl: undefined,
    bio: 'Conductor con más de 5 años de experiencia en Pamplona. Puntual y seguro.',
    rating: MOCK_DRIVER.rating,
    totalTrips: MOCK_DRIVER.totalTrips,
    vehicleDescription: `${MOCK_DRIVER.vehicle.brand} ${MOCK_DRIVER.vehicle.model} ${MOCK_DRIVER.vehicle.color} • ${MOCK_DRIVER.vehicle.plate}`,
    memberSince: new Date('2021-03-15'),
    documents: docs,
  };
  profileStore.set(MOCK_DRIVER.id, profile);
  return profile;
}

seedDemoDriver();

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrCreate(driverId: string, fallbackName = 'Conductor Nexum', fallbackPhone = ''): DriverProfile {
  let p = profileStore.get(driverId);
  if (!p) {
    p = {
      driverId,
      fullName: fallbackName,
      phone: fallbackPhone,
      rating: 5.0,
      totalTrips: 0,
      vehicleDescription: 'Vehículo sin registrar',
      memberSince: new Date(),
      documents: new Map(),
    };
    profileStore.set(driverId, p);
  }
  return p;
}

function docToDTO(d: DriverDocument): DriverDocumentDTO {
  return {
    type: d.type,
    label: DOC_LABELS[d.type],
    fileUrl: d.fileUrl,
    status: d.status,
    expiresAt: d.expiresAt,
    rejectionReason: d.rejectionReason,
    uploadedAt: d.uploadedAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString(),
  };
}

/** A driver is verified once every required document is approved. */
export function isDriverVerified(driverId: string): boolean {
  const p = profileStore.get(driverId);
  if (!p) return false;
  return REQUIRED_DOCS.every((t) => p.documents.get(t)?.status === 'approved');
}

function buildDocList(p: DriverProfile): DriverDocumentDTO[] {
  // Always return a row per required doc, even if not yet uploaded.
  return REQUIRED_DOCS.map((t) => {
    const existing = p.documents.get(t);
    if (existing) return docToDTO(existing);
    return {
      type: t,
      label: DOC_LABELS[t],
      fileUrl: '',
      status: 'missing' as DocumentStatus,
      uploadedAt: '',
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDriverProfile(driverId: string): Promise<DriverProfileDTO> {
  // Merge DB data with in-memory profile for real drivers
  if (!profileStore.has(driverId)) {
    const dbDriver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (dbDriver) {
      profileStore.set(driverId, {
        driverId,
        fullName: dbDriver.name,
        phone: dbDriver.phone,
        photoUrl: dbDriver.avatarUrl ?? undefined,
        bio: dbDriver.bio ?? undefined,
        rating: dbDriver.rating,
        totalTrips: dbDriver.totalTrips,
        vehicleDescription: 'Vehículo sin registrar',
        memberSince: dbDriver.createdAt,
        documents: new Map(),
      });
    }
  }

  const p = getOrCreate(driverId);
  const docs = buildDocList(p);
  const verified = isDriverVerified(driverId);
  const approvedCount = docs.filter((d) => d.status === 'approved').length;

  return {
    driverId: p.driverId,
    fullName: p.fullName,
    phone: p.phone,
    photoUrl: p.photoUrl,
    bio: p.bio,
    rating: p.rating,
    totalTrips: p.totalTrips,
    vehicleDescription: p.vehicleDescription,
    memberSince: p.memberSince.toISOString(),
    isVerified: verified,
    documents: docs,
    requiredDocsCount: REQUIRED_DOCS.length,
    approvedDocsCount: approvedCount,
  };
}

export function getDriverPublicProfile(driverId: string): DriverPublicProfileDTO | null {
  const p = profileStore.get(driverId);
  if (!p) return null;
  return {
    driverId: p.driverId,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    bio: p.bio,
    rating: p.rating,
    totalTrips: p.totalTrips,
    vehicleDescription: p.vehicleDescription,
    memberSince: p.memberSince.toISOString(),
    isVerified: isDriverVerified(driverId),
  };
}

export async function updateDriverProfile(
  driverId: string,
  patch: { fullName?: string; bio?: string; photoUrl?: string; vehicleDescription?: string },
): Promise<DriverProfileDTO> {
  const p = getOrCreate(driverId);
  if (patch.fullName !== undefined) p.fullName = patch.fullName;
  if (patch.bio !== undefined) p.bio = patch.bio;
  if (patch.photoUrl !== undefined) p.photoUrl = patch.photoUrl;
  if (patch.vehicleDescription !== undefined) p.vehicleDescription = patch.vehicleDescription;

  // Fire-and-forget DB persistence for bio/avatarUrl
  prisma.driver.update({
    where: { id: driverId },
    data: {
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.photoUrl !== undefined ? { avatarUrl: patch.photoUrl } : {}),
    },
  }).catch(() => {});

  return getDriverProfile(driverId);
}

/** Driver uploads (or re-uploads) a document. Resets it to pending review. */
export async function upsertDriverDocument(
  driverId: string,
  dto: UpsertDriverDocumentDTO,
): Promise<DriverProfileDTO> {
  const p = getOrCreate(driverId);
  p.documents.set(dto.type, {
    type: dto.type,
    fileUrl: dto.fileUrl,
    status: 'pending',
    expiresAt: dto.expiresAt,
    uploadedAt: new Date(),
  });
  return getDriverProfile(driverId);
}

/** Admin/review action — approve or reject an uploaded document. */
export async function reviewDriverDocument(
  driverId: string,
  type: DriverDocumentType,
  approve: boolean,
  rejectionReason?: string,
): Promise<DriverProfileDTO | null> {
  const p = profileStore.get(driverId);
  const doc = p?.documents.get(type);
  if (!p || !doc) return null;
  doc.status = approve ? 'approved' : 'rejected';
  doc.rejectionReason = approve ? undefined : rejectionReason;
  doc.reviewedAt = new Date();
  return getDriverProfile(driverId);
}
