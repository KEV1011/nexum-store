/**
 * El panel admin NO entra con la llave de la app.
 *
 * Sin SMS, `OTP_FALLBACK_CODE` lo conoce todo el que prueba la app. Si el panel
 * lo aceptara, cualquiera de ellos con el número de un administrador entraría
 * a documentos, conductores, comisiones y retiros.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ADMIN = '+573000000001';

async function cargar(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  vi.doMock('./sms.service', () => ({
    isSmsConfigured: () => false,
    sendSmsVerification: vi.fn(),
    checkSmsVerification: vi.fn(),
  }));
  vi.doMock('../config/constants', () => ({
    NODE_ENV: 'production',
    OTP_RIESGO_LLAVE_MAESTRA: true,
  }));
  return import('./otp.service');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('./sms.service');
  vi.doUnmock('../config/constants');
});

describe('código del panel admin en producción sin SMS', () => {
  it('con ADMIN_OTP_CODE, la llave de la app NO abre el panel', async () => {
    const otp = await cargar({ OTP_FALLBACK_CODE: '111111', ADMIN_OTP_CODE: '98765432' });
    await expect(otp.validateAdminOtp(ADMIN, '111111')).rejects.toThrow('Código inválido');
    await expect(otp.validateAdminOtp(`${ADMIN}9`, '98765432')).resolves.toBeUndefined();
    expect(otp.adminConLlaveCompartida()).toBe(false);
    expect(otp.otpMode().admin).toBe('codigo-propio-admin');
  });

  it('sin ADMIN_OTP_CODE se sigue entrando (no deja fuera al operador) pero se marca el riesgo', async () => {
    const otp = await cargar({ OTP_FALLBACK_CODE: '111111', ADMIN_OTP_CODE: undefined });
    await expect(otp.validateAdminOtp(ADMIN, '111111')).resolves.toBeUndefined();
    expect(otp.adminConLlaveCompartida()).toBe(true);
    expect(otp.otpMode().admin).toBe('llave-maestra-COMPARTIDA-con-la-app');
  });

  it('un ADMIN_OTP_CODE igual al de la app no cuenta como propio', async () => {
    const otp = await cargar({ OTP_FALLBACK_CODE: '111111', ADMIN_OTP_CODE: '111111' });
    expect(otp.adminConLlaveCompartida()).toBe(true);
  });

  it('con solo ADMIN_OTP_CODE, la app queda cerrada y el panel abierto', async () => {
    const otp = await cargar({ OTP_FALLBACK_CODE: undefined, ADMIN_OTP_CODE: '98765432' });
    expect(otp.otpMode()).toEqual({ users: 'cerrado', admin: 'codigo-propio-admin' });
    await expect(otp.validateAdminOtp(ADMIN, '98765432')).resolves.toBeUndefined();
  });
});
