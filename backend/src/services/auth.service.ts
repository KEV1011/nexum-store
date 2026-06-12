import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { DriverDTO, JwtPayload, RegisterDriverDTO } from '../types';
import { prisma } from '../lib/prisma';
import { requestOtp, validateOtp } from './otp.service';

export function isValidColombianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+57[3][0-9]{9}$/.test(cleaned);
}

export async function sendOtp(phone: string): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { phone } });
  await requestOtp(phone, driver?.id);
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; driver: DriverDTO; isRegistered: boolean }> {
  await validateOtp(phone, otp);

  const existingDriver = await prisma.driver.findUnique({
    where: { phone },
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });

  const isRegistered = existingDriver !== null;

  const driver: DriverDTO = existingDriver
    ? _driverToDTO(existingDriver, existingDriver.vehicles[0])
    : {
        id: '',
        name: '',
        phone,
        rating: 0,
        totalTrips: 0,
        vehicle: { brand: '', model: '', year: 0, plate: '', color: '' },
        bankAccount: { bank: '', type: '', number: '' },
      };

  const payload: JwtPayload = {
    driverId: existingDriver?.id ?? phone,
    phone,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, driver, isRegistered };
}

export async function registerDriver(dto: RegisterDriverDTO): Promise<{ token: string; driver: DriverDTO }> {
  const plateRegex = /^[A-Z]{3}-[0-9]{3}$/;
  if (!plateRegex.test(dto.vehiclePlate)) {
    throw new Error('Invalid vehicle plate format. Expected Colombian format: ABC-123');
  }

  const vehicleTypeMap: Record<string, 'PARTICULAR' | 'TAXI' | 'MOTO'> = {
    particular: 'PARTICULAR',
    taxi: 'TAXI',
    moto: 'MOTO',
  };
  const vehicleType = vehicleTypeMap[dto.vehicleType.toLowerCase()] ?? 'PARTICULAR';

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.driver.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        // Update existing driver record
        const updated = await tx.driver.update({
          where: { phone: dto.phone },
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
          phone: dto.phone,
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
    const payload: JwtPayload = { driverId: result.driver.id, phone: dto.phone };
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
