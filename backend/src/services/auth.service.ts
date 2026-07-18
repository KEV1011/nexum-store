import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { DriverDTO, JwtPayload, RegisterDriverDTO } from '../types';
import { prisma } from '../lib/prisma';
import { requestOtp, validateOtp } from './otp.service';

export function isValidColombianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+57[3][0-9]{9}$/.test(cleaned);
}

/**
 * Normaliza cualquier variante (con/sin +57, con espacios o guiones) al formato
 * canónico E.164 que la app envía: "+57" + 10 dígitos. Imprescindible para que
 * la afiliación por teléfono case EXACTO con el login por OTP.
 */
export function normalizeColombianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('57') ? digits.slice(2) : digits;
  return `+57${local}`;
}

export async function sendOtp(phone: string): Promise<void> {
  // Normaliza SIEMPRE a E.164 (+57…): la afiliación de empresa y el login del
  // portal ya normalizan, así que el conductor debe casar por el mismo formato
  // — de lo contrario un teléfono en otro formato entra a una cuenta fantasma
  // sin afiliación. El OTP se emite/valida sobre el mismo número normalizado.
  const normalized = normalizeColombianPhone(phone);
  const driver = await prisma.driver.findUnique({ where: { phone: normalized } });
  await requestOtp(normalized, driver?.id);
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; driver: DriverDTO; isRegistered: boolean }> {
  const normalized = normalizeColombianPhone(phone);
  await validateOtp(normalized, otp);

  const existingDriver = await prisma.driver.findUnique({
    where: { phone: normalized },
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });

  const isRegistered = existingDriver !== null;

  const driver: DriverDTO = existingDriver
    ? _driverToDTO(existingDriver, existingDriver.vehicles[0])
    : {
        id: '',
        name: '',
        phone: normalized,
        rating: 0,
        totalTrips: 0,
        vehicle: { brand: '', model: '', year: 0, plate: '', color: '' },
        bankAccount: { bank: '', type: '', number: '' },
      };

  const payload: JwtPayload = {
    driverId: existingDriver?.id ?? normalized,
    phone: normalized,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, driver, isRegistered };
}

export async function registerDriver(dto: RegisterDriverDTO): Promise<{ token: string; driver: DriverDTO }> {
  // Normaliza la placa (mayúsculas, sin espacios ni guiones) y acepta los
  // formatos colombianos REALES: carro ABC123 y moto ABC12D. El formato anterior
  // exigía un guión (ABC-123) que no existe en las placas → registro rechazado.
  const plate = dto.vehiclePlate.toUpperCase().replace(/[\s-]/g, '');
  const carPlate = /^[A-Z]{3}[0-9]{3}$/; // ABC123
  const motoPlate = /^[A-Z]{3}[0-9]{2}[A-Z]$/; // ABC12D
  if (!carPlate.test(plate) && !motoPlate.test(plate)) {
    throw new Error('Placa inválida. Usa el formato colombiano: ABC123 (carro) o ABC12D (moto).');
  }
  dto = { ...dto, vehiclePlate: plate };

  const vehicleTypeMap: Record<string, 'PARTICULAR' | 'TAXI' | 'MOTO' | 'TURBO' | 'CAMION' | 'MULA'> = {
    particular: 'PARTICULAR',
    taxi: 'TAXI',
    moto: 'MOTO',
    turbo: 'TURBO',
    camion: 'CAMION',
    mula: 'MULA',
  };
  const vehicleType = vehicleTypeMap[dto.vehicleType.toLowerCase()] ?? 'PARTICULAR';
  // Mismo E.164 que el login y la afiliación (evita cuentas duplicadas).
  const phone = normalizeColombianPhone(dto.phone);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.driver.findUnique({ where: { phone } });
      if (existing) {
        // Update existing driver record
        const updated = await tx.driver.update({
          where: { phone },
          data: {
            name: dto.fullName,
            documentType: dto.documentType,
            documentNumber: dto.documentNumber,
            bankName: dto.bankName,
            bankAccountType: dto.bankAccountType,
            bankAccountNumber: dto.bankAccountNumber,
          },
          include: { vehicles: { where: { isActive: true }, take: 1 } },
        });
        // Upsert vehicle
        const vehicle = await tx.vehicle.upsert({
          where: { plate: dto.vehiclePlate },
          update: {
            brand: dto.vehicleBrand,
            model: dto.vehicleModel,
            year: dto.vehicleYear,
            color: dto.vehicleColor,
            type: vehicleType,
            isActive: true,
          },
          create: {
            driverId: updated.id,
            type: vehicleType,
            brand: dto.vehicleBrand,
            model: dto.vehicleModel,
            year: dto.vehicleYear,
            plate: dto.vehiclePlate,
            color: dto.vehicleColor,
          },
        });
        return { driver: updated, vehicle };
      }
      const driver = await tx.driver.create({
        data: {
          phone,
          name: dto.fullName,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          bankName: dto.bankName,
          bankAccountType: dto.bankAccountType,
          bankAccountNumber: dto.bankAccountNumber,
        },
      });
      const vehicle = await tx.vehicle.create({
        data: {
          driverId: driver.id,
          type: vehicleType,
          brand: dto.vehicleBrand,
          model: dto.vehicleModel,
          year: dto.vehicleYear,
          plate: dto.vehiclePlate,
          color: dto.vehicleColor,
        },
      });
      return { driver, vehicle };
    });

    const driverDTO = _driverToDTO(result.driver, result.vehicle);
    const payload: JwtPayload = { driverId: result.driver.id, phone };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { token, driver: driverDTO };
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      throw new Error('A driver with that document number or vehicle plate already exists');
    }
    throw err;
  }
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _driverToDTO(
  driver: {
    id: string; name: string; phone: string; rating: number; totalTrips: number;
    bankName: string | null; bankAccountType: string | null; bankAccountNumber: string | null;
  },
  vehicle?: { brand: string; model: string; year: number; plate: string; color: string } | null,
): DriverDTO {
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    rating: driver.rating,
    totalTrips: driver.totalTrips,
    vehicle: vehicle
      ? { brand: vehicle.brand, model: vehicle.model, year: vehicle.year, plate: vehicle.plate, color: vehicle.color }
      : { brand: '', model: '', year: 0, plate: '', color: '' },
    bankAccount: {
      bank: driver.bankName ?? '',
      type: driver.bankAccountType ?? '',
      number: driver.bankAccountNumber ?? '',
    },
  };
}
