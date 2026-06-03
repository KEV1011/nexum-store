import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { prisma } from '../lib/prisma';
import {
  AccountDriverDTO,
  AccountRole,
  AccountStatus,
  AdminAccountDTO,
  JwtPayload,
  RegisterRoleDTO,
  Vehicle,
} from '../types';

export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length >= 7) return digits;
  return trimmed.toLowerCase();
}

const EMPTY_VEHICLE: Vehicle = { brand: '', model: '', year: 0, plate: '', color: '' };

function toDriverDTO(d: {
  id: string; name: string; phone: string | null; email: string | null;
  rating: number; totalTrips: number; role: string; accountStatus: string;
  vehicles: Array<{ brand: string; model: string; year: number; plate: string; color: string }>;
  documentType: string | null; licenseNumber: string; vehicleTypeStr: string | null;
  bankName: string | null; bankAccountType: string | null; bankAccountNumber: string | null;
}): AccountDriverDTO {
  const v = d.vehicles[0];
  return {
    id: d.id,
    name: d.name,
    phone: d.phone ?? '',
    email: d.email ?? undefined,
    rating: d.rating,
    totalTrips: d.totalTrips,
    role: d.role as AccountRole,
    accountStatus: d.accountStatus as AccountStatus,
    vehicle: v ? { brand: v.brand, model: v.model, year: v.year, plate: v.plate, color: v.color } : EMPTY_VEHICLE,
    documentType: d.documentType ?? undefined,
    documentNumber: d.licenseNumber,
    vehicleType: d.vehicleTypeStr ?? undefined,
    bankName: d.bankName ?? undefined,
    bankAccountType: d.bankAccountType ?? undefined,
    bankAccountNumber: d.bankAccountNumber ?? undefined,
  };
}

function toAdminDTOFromDriver(d: {
  id: string; name: string; phone: string | null; email: string | null;
  role: string; accountStatus: string; createdAt: Date;
  vehicles: Array<{ plate: string }>;
  vehicleTypeStr: string | null; commissionRate: number;
  rejectionReason: string | null; suspensionReason: string | null;
}): AdminAccountDTO {
  return {
    id: d.id,
    fullName: d.name,
    identifier: d.phone ?? d.email ?? d.id,
    role: d.role as AccountRole,
    status: d.accountStatus as AccountStatus,
    createdAt: d.createdAt.toISOString(),
    vehiclePlate: d.vehicles[0]?.plate,
    vehicleType: d.vehicleTypeStr ?? undefined,
    commissionRate: d.commissionRate,
    rejectionReason: d.rejectionReason ?? undefined,
    suspensionReason: d.suspensionReason ?? undefined,
  };
}

function issueToken(id: string, phone: string, role: string): string {
  const payload: JwtPayload = { driverId: id, phone, accountId: id, role: role as AccountRole };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ─── Auth-facing operations ──────────────────────────────────────────────────

export async function checkIdentifier(
  identifier: string,
): Promise<{ exists: boolean; role: AccountRole | null; status: AccountStatus | null }> {
  const normalized = normalizeIdentifier(identifier);
  const driver = await prisma.driver.findFirst({
    where: { OR: [{ phone: normalized }, { email: normalized }] },
    select: { role: true, accountStatus: true },
  });
  if (!driver) return { exists: false, role: null, status: null };
  return { exists: true, role: driver.role as AccountRole, status: driver.accountStatus as AccountStatus };
}

export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<{ token: string; driver: AccountDriverDTO }> {
  const normalized = normalizeIdentifier(identifier);
  const driver = await prisma.driver.findFirst({
    where: { OR: [{ phone: normalized }, { email: normalized }] },
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });

  if (!driver || !driver.passwordHash || !bcrypt.compareSync(password, driver.passwordHash)) {
    throw new Error('Credenciales incorrectas');
  }
  if (driver.accountStatus === 'rejected') throw new Error('Esta cuenta fue rechazada. Contacta a soporte.');
  if (driver.accountStatus === 'suspended') throw new Error('Esta cuenta está suspendida. Contacta a soporte.');

  const token = issueToken(driver.id, driver.phone, driver.role);
  return { token, driver: toDriverDTO(driver) };
}

export async function registerWithRole(
  dto: RegisterRoleDTO,
): Promise<{ token: string; driver: AccountDriverDTO }> {
  if (!dto.password || dto.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

  const normalized = normalizeIdentifier(dto.identifier);
  const existing = await prisma.driver.findFirst({
    where: { OR: [{ phone: normalized }, { email: normalized }] },
  });
  if (existing) throw new Error('Ya existe una cuenta con este identificador');

  const validRoles: AccountRole[] = ['driver_car', 'driver_moto', 'business'];
  if (!validRoles.includes(dto.role)) throw new Error('Rol inválido');

  const p = dto.profile ?? {};
  const str = (k: string) => typeof p[k] === 'string' && (p[k] as string).length > 0 ? (p[k] as string) : undefined;
  const num = (k: string) => typeof p[k] === 'number' ? (p[k] as number) : undefined;

  const isPhone = /^\+?[\d\s]+$/.test(dto.identifier.trim());
  const phone = isPhone ? normalized : str('contactPhone');
  const email = !isPhone ? normalized : str('contactEmail');

  const plate = str('vehiclePlate');

  const driver = await prisma.driver.create({
    data: {
      phone: phone ?? `dummy-${Date.now()}`,
      name: str('fullName') ?? str('companyName') ?? 'Usuario',
      email: email ?? undefined,
      licenseNumber: str('documentNumber') ?? `auto-${Date.now()}`,
      passwordHash: bcrypt.hashSync(dto.password, 10),
      accountStatus: 'pending',
      role: dto.role,
      documentType: str('documentType'),
      vehicleTypeStr: str('vehicleType'),
      bankName: str('bankName'),
      bankAccountType: str('bankAccountType'),
      bankAccountNumber: str('bankAccountNumber'),
      commissionRate: dto.role === 'driver_moto' ? 0.1 : 0.13,
      vehicles: plate ? {
        create: {
          type: 'PARTICULAR',
          brand: str('vehicleBrand') ?? '',
          model: str('vehicleModel') ?? '',
          year: num('vehicleYear') ?? 2020,
          plate,
          color: str('vehicleColor') ?? '',
        },
      } : undefined,
    },
    include: { vehicles: { take: 1 } },
  });

  const token = issueToken(driver.id, driver.phone, driver.role);
  return { token, driver: toDriverDTO(driver) };
}

// ─── Admin-facing operations ─────────────────────────────────────────────────

const DRIVER_INCLUDE = { vehicles: { where: { isActive: true }, take: 1 } } as const;

export async function listAccounts(filters: {
  search?: string;
  status?: AccountStatus;
  role?: AccountRole;
}): Promise<AdminAccountDTO[]> {
  const drivers = await prisma.driver.findMany({
    where: {
      isAdmin: false,
      ...(filters.status ? { accountStatus: filters.status } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.search ? {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: DRIVER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return drivers.map(toAdminDTOFromDriver);
}

async function updateDriverAccount(id: string, data: Record<string, unknown>): Promise<AdminAccountDTO> {
  const driver = await prisma.driver.update({
    where: { id },
    data,
    include: DRIVER_INCLUDE,
  });
  return toAdminDTOFromDriver(driver);
}

export function approveAccount(id: string): Promise<AdminAccountDTO> {
  return updateDriverAccount(id, { accountStatus: 'approved', isVerified: true, rejectionReason: null, suspensionReason: null });
}

export function rejectAccount(id: string, reason?: string): Promise<AdminAccountDTO> {
  return updateDriverAccount(id, { accountStatus: 'rejected', rejectionReason: reason ?? null });
}

export function suspendAccount(id: string, reason?: string): Promise<AdminAccountDTO> {
  return updateDriverAccount(id, { accountStatus: 'suspended', suspensionReason: reason ?? null });
}

export function updateCommission(id: string, rate: number): Promise<AdminAccountDTO> {
  if (rate < 0 || rate > 1) throw new Error('La comisión debe estar entre 0 y 1');
  return updateDriverAccount(id, { commissionRate: rate });
}

export function toAdminDTO(dto: AdminAccountDTO): AdminAccountDTO { return dto; }
