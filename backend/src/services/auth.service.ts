import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_OTP, MOCK_DRIVER } from '../config/constants';
import { DriverDTO, JwtPayload, RegisterDriverDTO } from '../types';

// In-memory OTP store: phone → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// In-memory driver store: phone → DriverDTO
const driverStore = new Map<string, DriverDTO>();

// Initialize with MOCK_DRIVER so it is treated as already registered
driverStore.set(MOCK_DRIVER.phone, {
  id: MOCK_DRIVER.id,
  name: MOCK_DRIVER.name,
  phone: MOCK_DRIVER.phone,
  rating: MOCK_DRIVER.rating,
  totalTrips: MOCK_DRIVER.totalTrips,
  vehicle: MOCK_DRIVER.vehicle,
  bankAccount: MOCK_DRIVER.bankAccount,
});

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validates a Colombian phone number in +57 format.
 * Accepts formats like "+57 312 456 7890" or "+573124567890".
 */
export function isValidColombianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+57[3][0-9]{9}$/.test(cleaned);
}

/**
 * Generates a 6-digit OTP and stores it against the phone number.
 * In production this would send an SMS; here we always store MOCK_OTP.
 */
export function sendOtp(phone: string): void {
  const otp = MOCK_OTP; // always "123456" for the mock
  otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });
}

/**
 * Verifies the supplied OTP against the store.
 * Returns the JWT, DriverDTO, and whether the driver is already registered.
 */
export function verifyOtp(
  phone: string,
  otp: string
): { token: string; driver: DriverDTO; isRegistered: boolean } {
  const record = otpStore.get(phone);

  if (!record) {
    throw new Error('No OTP requested for this phone number');
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    throw new Error('OTP has expired');
  }

  if (record.otp !== otp) {
    throw new Error('Invalid OTP');
  }

  // Consume the OTP so it can't be reused
  otpStore.delete(phone);

  const isRegistered = driverStore.has(phone);

  // For registered drivers use the stored record; for new ones use a placeholder
  const existingDriver = driverStore.get(phone);

  const driver: DriverDTO = existingDriver ?? {
    id: '',
    name: '',
    phone,
    rating: 0,
    totalTrips: 0,
    vehicle: {
      brand: '',
      model: '',
      year: 0,
      plate: '',
      color: '',
    },
    bankAccount: {
      bank: '',
      type: '',
      number: '',
    },
  };

  const payload: JwtPayload = {
    driverId: existingDriver ? existingDriver.id : phone,
    phone,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { token, driver, isRegistered };
}

/**
 * Registers a new driver with the supplied DTO.
 * Validates the vehicle plate format, persists to driverStore, and returns a JWT.
 */
export function registerDriver(dto: RegisterDriverDTO): { token: string; driver: DriverDTO } {
  const plateRegex = /^[A-Z]{3}-[0-9]{3}$/;
  if (!plateRegex.test(dto.vehiclePlate)) {
    throw new Error('Invalid vehicle plate format. Expected Colombian format: ABC-123');
  }

  const driver: DriverDTO = {
    id: dto.documentNumber,
    name: dto.fullName,
    phone: dto.phone,
    rating: 0,
    totalTrips: 0,
    vehicle: {
      brand: dto.vehicleBrand,
      model: dto.vehicleModel,
      year: dto.vehicleYear,
      plate: dto.vehiclePlate,
      color: dto.vehicleColor,
    },
    bankAccount: {
      bank: dto.bankName,
      type: dto.bankAccountType,
      number: dto.bankAccountNumber,
    },
  };

  driverStore.set(dto.phone, driver);

  const payload: JwtPayload = {
    driverId: dto.documentNumber,
    phone: dto.phone,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { token, driver };
}

/**
 * Verifies a JWT and returns the decoded payload.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
