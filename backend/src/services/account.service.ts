import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_DRIVER } from '../config/constants';
import {
  Account,
  AccountDriverDTO,
  AccountRole,
  AccountStatus,
  AdminAccountDTO,
  JwtPayload,
  RegisterRoleDTO,
  Vehicle,
} from '../types';

// ─── In-memory account store ──────────────────────────────────────────────────
// Mirrors the pattern used by auth.service.ts. Keyed by account id; a secondary
// index maps normalized identifiers → id for O(1) lookups.

const accounts = new Map<string, Account>();
const identifierIndex = new Map<string, string>();

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** Default platform commission per role (0.0–1.0). */
function defaultCommission(role: AccountRole): number {
  switch (role) {
    case 'driver_moto':
      return 0.1;
    case 'business':
      return 0.11;
    default:
      return 0.13;
  }
}

/**
 * Normalizes an identifier so the same phone/email always maps to one key.
 * - Emails: lowercased, trimmed.
 * - Phones: non-digits stripped (so "+57 312 456 7890" === "+573124567890").
 * - Usernames: lowercased, trimmed.
 */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length >= 7) return digits;
  return trimmed.toLowerCase();
}

function isEmail(raw: string): boolean {
  return raw.includes('@');
}

function indexAccount(acc: Account): void {
  accounts.set(acc.id, acc);
  identifierIndex.set(acc.identifier, acc.id);
}

function findByIdentifier(raw: string): Account | undefined {
  const id = identifierIndex.get(normalizeIdentifier(raw));
  return id ? accounts.get(id) : undefined;
}

// ─── Seed data ──────────────────────────────────────────────────────────────
// An admin account and the demo driver (MOCK_DRIVER) so the progressive
// identification + password flow works out of the box.

function seed(): void {
  if (accounts.size > 0) return;

  const admin: Account = {
    id: 'acc-admin-001',
    identifier: normalizeIdentifier('admin@nexum.co'),
    displayIdentifier: 'admin@nexum.co',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    status: 'approved',
    fullName: 'Administrador Nexum',
    email: 'admin@nexum.co',
    rating: 5,
    totalTrips: 0,
    commissionRate: 0,
    createdAt: new Date(),
  };
  indexAccount(admin);

  const driver: Account = {
    id: 'acc-driver-001',
    identifier: normalizeIdentifier(MOCK_DRIVER.phone),
    displayIdentifier: MOCK_DRIVER.phone,
    passwordHash: bcrypt.hashSync('nexum123', 10),
    role: 'driver_car',
    status: 'approved',
    fullName: MOCK_DRIVER.name,
    phone: MOCK_DRIVER.phone,
    rating: MOCK_DRIVER.rating,
    totalTrips: MOCK_DRIVER.totalTrips,
    commissionRate: 0.13,
    createdAt: new Date(),
    documentType: 'CC',
    documentNumber: '1090123456',
    vehicle: { ...MOCK_DRIVER.vehicle },
    vehicleType: 'particular',
    bankName: MOCK_DRIVER.bankAccount.bank,
    bankAccountType: MOCK_DRIVER.bankAccount.type,
    bankAccountNumber: MOCK_DRIVER.bankAccount.number,
  };
  indexAccount(driver);
}

seed();

// ─── Mappers ──────────────────────────────────────────────────────────────────

const EMPTY_VEHICLE: Vehicle = { brand: '', model: '', year: 0, plate: '', color: '' };

function toDriverDTO(acc: Account): AccountDriverDTO {
  return {
    id: acc.id,
    name: acc.fullName,
    phone: acc.phone ?? '',
    email: acc.email,
    rating: acc.rating,
    totalTrips: acc.totalTrips,
    role: acc.role,
    accountStatus: acc.status,
    vehicle: acc.vehicle ?? EMPTY_VEHICLE,
    documentType: acc.documentType,
    documentNumber: acc.documentNumber,
    vehicleType: acc.vehicleType,
    bankName: acc.bankName,
    bankAccountType: acc.bankAccountType,
    bankAccountNumber: acc.bankAccountNumber,
  };
}

export function toAdminDTO(acc: Account): AdminAccountDTO {
  return {
    id: acc.id,
    fullName: acc.fullName,
    identifier: acc.displayIdentifier,
    role: acc.role,
    status: acc.status,
    createdAt: acc.createdAt.toISOString(),
    vehiclePlate: acc.vehicle?.plate || undefined,
    vehicleType: acc.vehicleType,
    companyName: acc.companyName,
    commissionRate: acc.commissionRate,
    rejectionReason: acc.rejectionReason,
    suspensionReason: acc.suspensionReason,
  };
}

function issueToken(acc: Account): string {
  const payload: JwtPayload = {
    driverId: acc.id,
    phone: acc.phone ?? acc.identifier,
    accountId: acc.id,
    role: acc.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ─── Auth-facing operations ─────────────────────────────────────────────────

/** Progressive identification: does this identifier already have an account? */
export function checkIdentifier(
  identifier: string
): { exists: boolean; role: AccountRole | null; status: AccountStatus | null } {
  const acc = findByIdentifier(identifier);
  if (!acc) return { exists: false, role: null, status: null };
  return { exists: true, role: acc.role, status: acc.status };
}

/** Authenticates with identifier + password. Throws on failure. */
export function loginWithPassword(
  identifier: string,
  password: string
): { token: string; driver: AccountDriverDTO } {
  const acc = findByIdentifier(identifier);
  if (!acc || !bcrypt.compareSync(password, acc.passwordHash)) {
    throw new Error('Credenciales incorrectas');
  }
  if (acc.status === 'rejected') {
    throw new Error('Esta cuenta fue rechazada. Contacta a soporte.');
  }
  if (acc.status === 'suspended') {
    throw new Error('Esta cuenta está suspendida. Contacta a soporte.');
  }
  return { token: issueToken(acc), driver: toDriverDTO(acc) };
}

function str(profile: Record<string, unknown>, key: string): string | undefined {
  const v = profile[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(profile: Record<string, unknown>, key: string): number | undefined {
  const v = profile[key];
  return typeof v === 'number' ? v : undefined;
}

/** Registers a new account in the role-based flow. Always created as pending. */
export function registerWithRole(
  dto: RegisterRoleDTO
): { token: string; driver: AccountDriverDTO } {
  if (findByIdentifier(dto.identifier)) {
    throw new Error('Ya existe una cuenta con este identificador');
  }
  if (!dto.password || dto.password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }
  const validRoles: AccountRole[] = ['driver_car', 'driver_moto', 'business'];
  if (!validRoles.includes(dto.role)) {
    throw new Error('Rol inválido');
  }

  const p = dto.profile ?? {};
  const isBusiness = dto.role === 'business';
  const normalized = normalizeIdentifier(dto.identifier);

  const acc: Account = {
    id: nextId('acc'),
    identifier: normalized,
    displayIdentifier: dto.identifier.trim(),
    passwordHash: bcrypt.hashSync(dto.password, 10),
    role: dto.role,
    status: 'pending',
    fullName: isBusiness
      ? str(p, 'companyName') ?? 'Empresa'
      : str(p, 'fullName') ?? 'Conductor',
    email: isEmail(dto.identifier) ? normalized : str(p, 'contactEmail'),
    phone: isEmail(dto.identifier) ? str(p, 'contactPhone') : dto.identifier.trim(),
    rating: 5,
    totalTrips: 0,
    commissionRate: defaultCommission(dto.role),
    createdAt: new Date(),
    bankName: str(p, 'bankName'),
    bankAccountType: str(p, 'bankAccountType'),
    bankAccountNumber: str(p, 'bankAccountNumber'),
  };

  if (isBusiness) {
    acc.companyName = str(p, 'companyName');
    acc.nit = str(p, 'nit');
    acc.legalRep = str(p, 'legalRep');
    acc.address = str(p, 'address');
    acc.contactEmail = str(p, 'contactEmail');
    acc.contactPhone = str(p, 'contactPhone');
  } else {
    acc.documentType = str(p, 'documentType');
    acc.documentNumber = str(p, 'documentNumber');
    acc.vehicleType = str(p, 'vehicleType');
    acc.cylinderCc = num(p, 'cylinderCc');
    acc.vehicle = {
      brand: str(p, 'vehicleBrand') ?? '',
      model: str(p, 'vehicleModel') ?? '',
      year: num(p, 'vehicleYear') ?? 0,
      plate: str(p, 'vehiclePlate') ?? '',
      color: str(p, 'vehicleColor') ?? '',
    };
  }

  indexAccount(acc);
  return { token: issueToken(acc), driver: toDriverDTO(acc) };
}

// ─── Admin-facing operations ────────────────────────────────────────────────

export function listAccounts(filters: {
  search?: string;
  status?: AccountStatus;
  role?: AccountRole;
}): AdminAccountDTO[] {
  let list = Array.from(accounts.values()).filter((a) => a.role !== 'admin');

  if (filters.status) list = list.filter((a) => a.status === filters.status);
  if (filters.role) list = list.filter((a) => a.role === filters.role);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        a.displayIdentifier.toLowerCase().includes(q) ||
        (a.companyName?.toLowerCase().includes(q) ?? false)
    );
  }

  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.map(toAdminDTO);
}

function mutate(id: string, fn: (acc: Account) => void): AdminAccountDTO {
  const acc = accounts.get(id);
  if (!acc) throw new Error('Cuenta no encontrada');
  fn(acc);
  return toAdminDTO(acc);
}

export function approveAccount(id: string): AdminAccountDTO {
  return mutate(id, (a) => {
    a.status = 'approved';
    a.rejectionReason = undefined;
    a.suspensionReason = undefined;
  });
}

export function rejectAccount(id: string, reason?: string): AdminAccountDTO {
  return mutate(id, (a) => {
    a.status = 'rejected';
    a.rejectionReason = reason;
  });
}

export function suspendAccount(id: string, reason?: string): AdminAccountDTO {
  return mutate(id, (a) => {
    a.status = 'suspended';
    a.suspensionReason = reason;
  });
}

export function updateCommission(id: string, rate: number): AdminAccountDTO {
  if (rate < 0 || rate > 1) throw new Error('La comisión debe estar entre 0 y 1');
  return mutate(id, (a) => {
    a.commissionRate = rate;
  });
}
