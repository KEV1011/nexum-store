import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ESTADOS_SOLTABLES, faseDe, motivoParaNoSoltar } from './servicio-abierto';

describe('la fase en que se retoma', () => {
  it('viaje: yendo, esperando, con el pasajero', () => {
    expect(faseDe('trip', 'ACCEPTED')).toBe('recogida');
    expect(faseDe('trip', 'ARRIVING')).toBe('recogida');
    expect(faseDe('trip', 'ARRIVED')).toBe('en_espera');
    expect(faseDe('trip', 'IN_PROGRESS')).toBe('en_curso');
  });

  it('pedido y mandado', () => {
    expect(faseDe('order', 'DRIVER_TO_PICKUP')).toBe('recogida');
    expect(faseDe('order', 'AT_PICKUP')).toBe('en_espera');
    expect(faseDe('order', 'IN_TRANSIT')).toBe('en_curso');
    expect(faseDe('errand', 'ACCEPTED')).toBe('recogida');
    expect(faseDe('errand', 'SHOPPING')).toBe('en_espera');
    expect(faseDe('errand', 'ON_THE_WAY')).toBe('en_curso');
  });

  it('acepta el estado en minúscula, como lo mandan las apps', () => {
    expect(faseDe('trip', 'in_progress')).toBe('en_curso');
  });

  it('lo terminado o lo que aún no tiene conductor no tiene fase', () => {
    expect(faseDe('trip', 'COMPLETED')).toBeNull();
    expect(faseDe('trip', 'SEARCHING')).toBeNull();
    expect(faseDe('order', 'PREPARING')).toBeNull();
    expect(faseDe('errand', 'DELIVERED')).toBeNull();
  });
});

describe('cuándo se puede soltar', () => {
  it('antes de recoger, sí', () => {
    expect(motivoParaNoSoltar('trip', 'ACCEPTED')).toBeNull();
    expect(motivoParaNoSoltar('trip', 'ARRIVED')).toBeNull();
    expect(motivoParaNoSoltar('order', 'AT_PICKUP')).toBeNull();
    expect(motivoParaNoSoltar('errand', 'ACCEPTED')).toBeNull();
  });

  it('con el pasajero o la mercancía, no, y se dice qué hacer', () => {
    expect(motivoParaNoSoltar('trip', 'IN_PROGRESS')).toMatch(/termina el viaje/);
    expect(motivoParaNoSoltar('order', 'IN_TRANSIT')).toMatch(/entrégalo/);
    // La compra empezada: ya está gastando en el mostrador.
    expect(motivoParaNoSoltar('errand', 'SHOPPING')).toMatch(/compra/);
  });

  it('lo que ya no está en curso tampoco', () => {
    expect(motivoParaNoSoltar('trip', 'COMPLETED')).toMatch(/ya no está en curso/);
  });

  it('todo estado que se puede soltar es de recogida o espera, nunca en curso', () => {
    for (const tipo of ['trip', 'order', 'errand'] as const) {
      for (const e of ESTADOS_SOLTABLES[tipo]) expect(faseDe(tipo, e)).not.toBe('en_curso');
    }
  });

  it('los estados que nombra existen en el esquema de la base', () => {
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    const valores = (nombre: string) => {
      const m = schema.match(new RegExp(`enum ${nombre} \\{([^}]*)\\}`));
      return (m?.[1] ?? '').split('\n').map((l) => l.replace(/\/\/.*/, '').trim()).filter(Boolean);
    };
    const enums = { trip: valores('TripStatus'), order: valores('OrderStatus'), errand: valores('ErrandStatus') };
    for (const tipo of ['trip', 'order', 'errand'] as const) {
      for (const e of ESTADOS_SOLTABLES[tipo]) expect(enums[tipo]).toContain(e);
      for (const e of ['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'DRIVER_TO_PICKUP', 'AT_PICKUP',
        'IN_TRANSIT', 'SHOPPING', 'ON_THE_WAY']) {
        if (faseDe(tipo, e)) expect(enums[tipo]).toContain(e);
      }
    }
  });
});

// La app del conductor y el servidor tienen que hablar de las MISMAS rutas:
// si una se renombra, la hoja de «servicio sin cerrar» falla en silencio
// (al abrir la app, un error de red se calla a propósito).
describe('la app y el servidor hablan de las mismas rutas', () => {
  const raiz = join(__dirname, '..', '..', '..');
  const rutas = readFileSync(join(raiz, 'backend', 'src', 'routes', 'driver.routes.ts'), 'utf8');
  const app = readFileSync(join(raiz, 'AppTransport', 'lib', 'shared', 'services', 'servicios_abiertos.dart'), 'utf8');

  it('listar', () => {
    expect(rutas).toContain("router.get('/servicios-abiertos'");
    expect(app).toContain("'/driver/servicios-abiertos'");
  });

  it('soltar', () => {
    expect(rutas).toContain("router.post('/servicios/:tipo/:id/soltar'");
    expect(app).toContain("'/driver/servicios/${s.tipo}/${s.id}/soltar'");
  });

  it('los tipos que entiende la app son los del servidor', () => {
    for (const t of ['trip', 'order', 'errand']) expect(app).toContain(`'${t}'`);
  });
});
