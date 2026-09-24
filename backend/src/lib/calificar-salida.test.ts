import { describe, it, expect } from 'vitest';
import { motivoParaNoCalificar, type ContextoCalificacion } from './calificar-salida';

const SALIDA = new Date('2026-03-10T06:00:00Z');

function ctx(p: Partial<ContextoCalificacion> = {}): ContextoCalificacion {
  return {
    estadoSalida: 'completed',
    reservaCancelada: false,
    salidaEn: SALIDA,
    duracionMin: 240,
    ahora: new Date('2026-03-10T14:00:00Z'),
    ...p,
  };
}

describe('cuándo sí', () => {
  it('con la salida cerrada por el conductor', () => {
    expect(motivoParaNoCalificar(ctx())).toBeNull();
  });

  it('en curso, si por la duración de la ruta ya debería haber llegado', () => {
    // La razón de que esto exista: quien cierra la salida es el conductor, y
    // si se le olvida, el pasajero que sí viajó no podría calificar nunca —
    // la nota de la empresa dependería de la persona a la que juzga.
    expect(
      motivoParaNoCalificar(
        ctx({
          estadoSalida: 'departed',
          duracionMin: 240,
          ahora: new Date('2026-03-10T10:01:00Z'),
        }),
      ),
    ).toBeNull();
  });
});

describe('cuándo no, y diciendo por qué', () => {
  it('en curso pero todavía rodando', () => {
    const m = motivoParaNoCalificar(
      ctx({
        estadoSalida: 'departed',
        duracionMin: 240,
        ahora: new Date('2026-03-10T08:00:00Z'),
      }),
    );
    expect(m).toMatch(/termine el viaje/i);
  });

  it('en curso y sin duración conocida: no se da por llegado un bus que rueda', () => {
    for (const d of [null, undefined, 0]) {
      const m = motivoParaNoCalificar(ctx({ estadoSalida: 'departed', duracionMin: d }));
      expect(m, String(d)).toMatch(/cierre el viaje/i);
    }
  });

  it('antes de salir', () => {
    for (const e of ['open', 'full'] as const) {
      expect(motivoParaNoCalificar(ctx({ estadoSalida: e })), e).toMatch(/termine/i);
    }
  });

  it('una salida cancelada por la empresa', () => {
    expect(motivoParaNoCalificar(ctx({ estadoSalida: 'cancelled' }))).toMatch(/canceló/i);
  });

  it('quien canceló su reserva no viajó, así que no califica', () => {
    // Y manda sobre el estado de la salida: aunque el bus llegara perfecto,
    // esa persona no iba dentro.
    const m = motivoParaNoCalificar(ctx({ estadoSalida: 'completed', reservaCancelada: true }));
    expect(m).toMatch(/cancelaste/i);
  });
});
