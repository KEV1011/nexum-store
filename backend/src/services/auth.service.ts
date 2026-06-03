import jwt from 'jsonwebtoken';
import { VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_OTP, MOCK_DRIVER } from '../config/constants';
import { DriverDTO, JwtPayload, RegisterDriverDTO } from '../types';

const OTP_TTL_MS = 5 * 60 * 1000;

// Seed the demo driver once on first import (idempotent via upsert).
(async () => {
  try {
    await prisma.driver.upsert({
      where: { phone: MOCK_DRIVER.phone },
      update: {},
      create: {
        id: MOCK_DRIVER.id,
        phone: MOCK_DRIVER.phone,
        name: MOCK_DRIVER.name,
        licenseNumber: '1090123456',
        rating: MOCK_DRIVER.rating,
        totalTrips: MOCK_DRIVER.totalTrips,
        isVerified: true,
        vehicles: {
          create: {
            type: VehicleType.PARTICULAR,
            brand: MOCK_DRIVER.vehicle.brand,
            model: MOCK_DRIVER.vehicle.model,
            year: MOCK_DRIVER.vehicle.year,
            plate: MOCK_DRIVER.vehicle.plate,
            color: MOCK_DRIVER.vehicle.color,
          },
        },
      },
    });
  } catch {
    // Already seeded or race condition — safe to ignore
  }
})();

export function isValidColombianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+57[3][0-9]{9}$/.test(cleaned);
}

export async function sendOtp(phone: string): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpSession.create({ data: { phone, code: MOCK_OTP, expiresAt } });
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; driver: DriverDTO; isRegistered: boolean }> {
  const record = await prisma.otpSession.findFirst({
    where: { phone, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) throw new Error('No OTP requested for this phone number');
  if (record.code !== otp) throw new Error('Invalid OTP');

  await prisma.otpSession.update({ where: { id: record.id }, data: { used: true } });

  const dbDriver = await prisma.driver.findUnique({
    where: { phone },
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });

  if (dbDriver) {
    const v = dbDriver.vehicles[0];
    const driver: DriverDTO = {
      id: dbDriver.id,
      name: dbDriver.name,
      phone: dbDriver.phone,
      rating: dbDriver.rating,
      totalTrips: dbDriver.totalTrips,
      vehicle: v
        ? { brand: v.brand, model: v.model, year: v.year, plate: v.plate, color: v.color }
        : { brand: '', model: '', year: 0, plate: '', color: '' },
      bankAccount: { bank: '', type: '', number: '' },
    };
    const token = jwt.sign({ driverId: dbDriver.id, phone } as JwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { token, driver, isRegistered: true };
  }

  const driver: DriverDTO = {
    id: '',
    name: '',
    phone,
    rating: 0,
    totalTrips: 0,
    vehicle: { brand: '', model: '', year: 0, plate: '', color: '' },
    bankAccount: { bank: '', type: '', number: '' },
  };
  const token = jwt.sign({ driverId: phone, phone } as JwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, driver, isRegistered: false };
}

export async function registerDriver(
  dto: RegisterDriverDTO,
): Promise<{ token: string; driver: DriverDTO }> {
  const plateRegex = /^[A-Z]{3}-[0-9]{3}$/;
  if (!plateRegex.test(dto.vehiclePlate)) {
    throw new Error('Invalid vehicle plate format. Expected Colombian format: ABC-123');
  }

  const typeMap: Record<string, VehicleType> = {
    particular: VehicleType.PARTICULAR,
    taxi: VehicleType.TAXI,
    moto: VehicleType.MOTO,
  };
  const vehicleType = typeMap[dto.vehicleType] ?? VehicleType.PARTICULAR;

  const dbDriver = await prisma.driver.upsert({
    where: { phone: dto.phone },
    create: {
      phone: dto.phone,
      name: dto.fullName,
      licenseNumber: dto.documentNumber,
      vehicles: {
        create: {
          type: vehicleType,
          brand: dto.vehicleBrand,
          model: dto.vehicleModel,
          year: dto.vehicleYear,
          plate: dto.vehiclePlate,
          color: dto.vehicleColor,
        },
      },
    },
    update: { name: dto.fullName },
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });

  const v = dbDriver.vehicles[0];
  const driver: DriverDTO = {
    id: dbDriver.id,
    name: dbDriver.name,
    phone: dbDriver.phone,
    rating: dbDriver.rating,
    totalTrips: dbDriver.totalTrips,
    vehicle: v
      ? { brand: v.brand, model: v.model, year: v.year, plate: v.plate, color: v.color }
      : { brand: dto.vehicleBrand, model: dto.vehicleModel, year: dto.vehicleYear, plate: dto.vehiclePlate, color: dto.vehicleColor },
    bankAccount: { bank: dto.bankName, type: dto.bankAccountType, number: dto.bankAccountNumber },
  };

  const token = jwt.sign({ driverId: dbDriver.id, phone: dto.phone } as JwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, driver };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
