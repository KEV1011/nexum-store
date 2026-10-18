/**
 * Las reglas de cuenta de «Entrar con Google / Apple», contra una base en
 * memoria (aquí no hay motor de Prisma). Lo que se fija:
 *
 * - el mismo `sub` entra siempre a la MISMA cuenta, y una nueva nace sin
 *   teléfono;
 * - el correo NUNCA decide en qué cuenta se entra;
 * - una cuenta borrada no se reabre por la puerta de atrás;
 * - vincular no roba identidades de otra cuenta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'crypto';

type Fila = {
  id: string; phone: string | null; name: string | null; email: string | null;
  googleSub: string | null; appleSub: string | null; deletedAt: Date | null; isActive: boolean;
};
const filas: Fila[] = [];

function casa(f: Fila, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => (f as Record<string, unknown>)[k] === v);
}

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        filas.find((f) => casa(f, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Partial<Fila> }) => {
        for (const k of ['googleSub', 'appleSub', 'email', 'phone'] as const) {
          if (data[k] && filas.some((f) => f[k] === data[k])) throw new Error(`único ${k}`);
        }
        const f: Fila = {
          id: `u${filas.length + 1}`, phone: null, name: null, email: null,
          googleSub: null, appleSub: null, deletedAt: null, isActive: true, ...data,
        };
        filas.push(f);
        return f;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
        const f = filas.find((x) => x.id === where.id)!;
        Object.assign(f, data);
        return f;
      }),
    },
  },
}));

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const AUD = 'web.apps.googleusercontent.com';

function tokenGoogle(sub: string, extra: Record<string, unknown> = {}): string {
  const datos = `${b64({ alg: 'RS256', kid: 'g1' })}.${b64({
    iss: 'https://accounts.google.com', aud: AUD, sub,
    exp: Math.floor(Date.now() / 1000) + 600, ...extra,
  })}`;
  return `${datos}.${createSign('RSA-SHA256').update(datos).sign(privateKey).toString('base64url')}`;
}

const svc = await import('./acceso-social.service');

beforeEach(() => {
  filas.length = 0;
  process.env['GOOGLE_OAUTH_CLIENT_IDS'] = AUD;
  process.env['JWT_SECRET'] ??= 'prueba';
  svc._fijarLlaves('google', [{ kid: 'g1', kty: 'RSA', n: jwk.n, e: jwk.e }]);
});

describe('entrar con Google', () => {
  it('la primera vez abre cuenta SIN teléfono, con nombre y correo verificado', async () => {
    const r = await svc.entrarConProveedor('google', tokenGoogle('g-ana', {
      name: 'Ana Pérez', email: 'ana@gmail.com', email_verified: true,
    }));
    expect(r.nueva).toBe(true);
    expect(r.client.phone).toBeNull();
    expect(r.client.name).toBe('Ana Pérez');
    expect(r.client.needsName).toBeUndefined();
    expect(filas[0]).toMatchObject({ googleSub: 'g-ana', email: 'ana@gmail.com', phone: null });
    expect(r.token.split('.')).toHaveLength(3);
  });

  it('la segunda vez entra a la MISMA cuenta', async () => {
    const a = await svc.entrarConProveedor('google', tokenGoogle('g-ana'));
    const b = await svc.entrarConProveedor('google', tokenGoogle('g-ana'));
    expect(b.nueva).toBe(false);
    expect(b.client.id).toBe(a.client.id);
    expect(filas).toHaveLength(1);
  });

  it('sin nombre en el token, la app lo pregunta (needsName)', async () => {
    const r = await svc.entrarConProveedor('google', tokenGoogle('g-sin'));
    expect(r.client.needsName).toBe(true);
  });

  it('el correo NO decide la cuenta: el de otra persona no te mete en la suya', async () => {
    // Alguien abrió cuenta por teléfono y escribió en su perfil el correo de
    // Ana. Cuando Ana entra con Google, NO puede acabar en esa cuenta.
    filas.push({
      id: 'atacante', phone: '+573001112233', name: 'X', email: 'ana@gmail.com',
      googleSub: null, appleSub: null, deletedAt: null, isActive: true,
    });
    const r = await svc.entrarConProveedor('google', tokenGoogle('g-ana', {
      email: 'ana@gmail.com', email_verified: true,
    }));
    expect(r.client.id).not.toBe('atacante');
    // Y el correo, ocupado, no se le copia a la cuenta nueva (es único).
    expect(filas.find((f) => f.id === r.client.id)!.email).toBeNull();
  });

  it('un correo NO verificado por Google no se guarda', async () => {
    await svc.entrarConProveedor('google', tokenGoogle('g-nv', { email: 'x@y.co', email_verified: false }));
    expect(filas[0]!.email).toBeNull();
  });

  it('una cuenta borrada no se reabre', async () => {
    filas.push({
      id: 'borrada', phone: 'borrado:x', name: null, email: null,
      googleSub: 'g-borrada', appleSub: null, deletedAt: new Date(), isActive: false,
    });
    await expect(svc.entrarConProveedor('google', tokenGoogle('g-borrada')))
      .rejects.toMatchObject({ status: 403 });
  });

  it('sin configurar, responde 503 y no toca la base', async () => {
    delete process.env['GOOGLE_OAUTH_CLIENT_IDS'];
    await expect(svc.entrarConProveedor('google', tokenGoogle('g-x')))
      .rejects.toMatchObject({ status: 503 });
    expect(filas).toHaveLength(0);
  });

  it('un token falso es 401 y no crea nada', async () => {
    await expect(svc.entrarConProveedor('google', `${tokenGoogle('g-x')}xx`))
      .rejects.toMatchObject({ status: 401 });
    expect(filas).toHaveLength(0);
  });
});

describe('vincular Google a la cuenta en la que se está', () => {
  const telefono = (): Fila => ({
    id: 'tel', phone: '+573009998877', name: 'Luis', email: null,
    googleSub: null, appleSub: null, deletedAt: null, isActive: true,
  });

  it('después se entra con Google a esa misma cuenta', async () => {
    filas.push(telefono());
    await svc.vincularProveedor('tel', 'google', tokenGoogle('g-luis'));
    const r = await svc.entrarConProveedor('google', tokenGoogle('g-luis'));
    expect(r.client.id).toBe('tel');
    expect(r.client.phone).toBe('+573009998877');
  });

  it('no se puede quitar la identidad de Google a otra cuenta', async () => {
    filas.push(telefono());
    await svc.entrarConProveedor('google', tokenGoogle('g-ajena'));
    await expect(svc.vincularProveedor('tel', 'google', tokenGoogle('g-ajena')))
      .rejects.toMatchObject({ status: 409 });
    expect(filas.find((f) => f.id === 'tel')!.googleSub).toBeNull();
  });

  it('no se reemplaza una vinculación existente por otra cuenta de Google', async () => {
    filas.push({ ...telefono(), googleSub: 'g-primera' });
    await expect(svc.vincularProveedor('tel', 'google', tokenGoogle('g-segunda')))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe('lo que se anuncia', () => {
  it('sin variables, ningún botón', () => {
    delete process.env['GOOGLE_OAUTH_CLIENT_IDS'];
    delete process.env['APPLE_CLIENT_IDS'];
    expect(svc.configAcceso()).toEqual({ google: null, apple: null });
    expect(svc.modoAccesoSocial()).toBe('apagado');
  });

  it('el primer id de Google es el que usa la app', () => {
    process.env['GOOGLE_OAUTH_CLIENT_IDS'] = 'web-1, otro-2';
    expect(svc.configAcceso().google).toEqual({ clientId: 'web-1', audiencias: ['web-1', 'otro-2'] });
  });

  it('Apple en la web/Android solo con Services ID Y redirección', () => {
    process.env['APPLE_CLIENT_IDS'] = 'com.zipa.cliente.web';
    delete process.env['APPLE_SERVICES_ID'];
    expect(svc.configAcceso().apple?.web).toBeNull();
    process.env['APPLE_SERVICES_ID'] = 'com.zipa.cliente.web';
    process.env['APPLE_REDIRECT_URI'] = 'https://api.zipa.co/client/auth/apple/callback';
    expect(svc.configAcceso().apple?.web).toEqual({
      servicesId: 'com.zipa.cliente.web',
      redirectUri: 'https://api.zipa.co/client/auth/apple/callback',
    });
    delete process.env['APPLE_CLIENT_IDS'];
  });
});
