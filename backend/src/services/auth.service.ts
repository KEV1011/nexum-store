import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_OTP, MOCK_DRIVER } from '../config/constants';
import { DriverDTO, JwtPayload } from '../types';

// In-memory OTP store: phone → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

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
 * Returns the JWT and DriverDTO on success, throws on failure.
 */
export function verifyOtp(
  phone: string,
  otp: string
): { token: string; driver: DriverDTO } {
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

  const payload: JwtPayload = {
    driverId: MOCK_DRIVER.id,
    phone: MOCK_DRIVER.phone,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  const driver: DriverDTO = {
    id: MOCK_DRIVER.id,
    name: MOCK_DRIVER.name,
    phone: MOCK_DRIVER.phone,
    rating: MOCK_DRIVER.rating,
    totalTrips: MOCK_DRIVER.totalTrips,
    vehicle: MOCK_DRIVER.vehicle,
    bankAccount: MOCK_DRIVER.bankAccount,
  };

  return { token, driver };
}

/**
 * Verifies a JWT and returns the decoded payload.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
