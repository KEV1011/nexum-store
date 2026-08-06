import { describe, it, expect } from 'vitest';
import { evaluarOtp, sanearCodigo } from './otp-guard';

const base = { production: true, twilio: false, allowFixedOtp: false, codigoFijo: '' };

describe('evaluarOtp — arranque permitido', () => {
  it('fuera de producción arranca aunque no haya nada configurado', () => {
    const v = evaluarOtp({ ...base, production: false });
    expect(v).toEqual({ arranca: true, riesgo: false });
  });

  it('con Twilio arranca sin riesgo, aunque haya código fijo puesto', () => {
    const v = evaluarOtp({ ...base, twilio: true, codigoFijo: '123456' });
    expect(v).toEqual({ arranca: true, riesgo: false });
  });

  it('piloto autorizado con código propio arranca marcado como riesgo', () => {
    const v = evaluarOtp({ ...base, allowFixedOtp: true, codigoFijo: '481902' });
    expect(v.arranca).toBe(true);
    expect(v.arranca && v.riesgo).toBe(true);
  });
});

describe('evaluarOtp — arranque abortado', () => {
  it('producción sin SMS y sin autorización explícita NO arranca', () => {
    const v = evaluarOtp(base);
    expect(v.arranca).toBe(false);
    // El motivo tiene que decir qué hacer, no solo que algo está mal.
    expect(!v.arranca && v.motivo).toMatch(/ALLOW_FIXED_OTP=true/);
    expect(!v.arranca && v.motivo).toMatch(/TWILIO_VERIFY_SID/);
  });

  it('autorizar el piloto sin código propio NO arranca: caería al 123456 del repo', () => {
    const v = evaluarOtp({ ...base, allowFixedOtp: true });
    expect(v.arranca).toBe(false);
    expect(!v.arranca && v.motivo).toMatch(/OTP_FALLBACK_CODE/);
  });

  it.each(['123456', '000000', '111111', '654321', '012345'])(
    'rechaza el código trivial %s',
    (codigoFijo) => {
      const v = evaluarOtp({ ...base, allowFixedOtp: true, codigoFijo });
      expect(v.arranca).toBe(false);
    },
  );

  it.each(['1234', '12345', 'abcdef', '12 34 56', '4819o2'])(
    'rechaza el código mal formado %s',
    (codigoFijo) => {
      const v = evaluarOtp({ ...base, allowFixedOtp: true, codigoFijo });
      expect(v.arranca).toBe(false);
    },
  );
});

describe('sanearCodigo', () => {
  // Pegar el valor en el panel de Render arrastra comillas y espacios que
  // quedan DENTRO del valor: el operador teclea 481902 y nunca casa.
  it('quita espacios y comillas', () => {
    expect(sanearCodigo('  481902 ')).toBe('481902');
    expect(sanearCodigo('"481902"')).toBe('481902');
    expect(sanearCodigo("'481902'")).toBe('481902');
  });

  it('sin valor devuelve cadena vacía', () => {
    expect(sanearCodigo(undefined)).toBe('');
  });
});
