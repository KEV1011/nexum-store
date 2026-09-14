import { describe, it, expect } from 'vitest';
import {
  saneaReporte,
  saneaBloqueo,
  etiquetaMotivo,
  ReporteInvalido,
  MOTIVOS,
  MOTIVOS_URGENTES,
  MAX_DETALLE,
} from './reportes';

describe('saneaReporte', () => {
  const ok = { targetKind: 'driver', targetId: 'd1', reason: 'acoso' };

  it('acepta un reporte del catálogo', () => {
    const r = saneaReporte(ok, 'client', 'u1');
    expect(r.targetKind).toBe('driver');
    expect(r.reason).toBe('acoso');
    expect(r.urgente).toBe(true);
  });

  it('rechaza un motivo que no está en la lista', () => {
    // Un motivo libre hace la cola imposible de ordenar: lo urgente se
    // esconde entre lo que no lo es.
    expect(() => saneaReporte({ ...ok, reason: 'no_me_gusto' }, 'client', 'u1'))
      .toThrow(ReporteInvalido);
  });

  it('rechaza un objetivo que no sabemos qué es', () => {
    expect(() => saneaReporte({ ...ok, targetKind: 'planeta' }, 'client', 'u1'))
      .toThrow(ReporteInvalido);
  });

  it('exige saber qué se reporta', () => {
    expect(() => saneaReporte({ ...ok, targetId: '  ' }, 'client', 'u1'))
      .toThrow(ReporteInvalido);
  });

  it('«otro» sin explicación no es un reporte, es un clic', () => {
    expect(() => saneaReporte({ ...ok, reason: 'otro' }, 'client', 'u1'))
      .toThrow(ReporteInvalido);
    expect(
      saneaReporte({ ...ok, reason: 'otro', detail: 'Me cobró de más' }, 'client', 'u1').detail,
    ).toBe('Me cobró de más');
  });

  it('nadie se reporta a sí mismo', () => {
    expect(() =>
      saneaReporte({ targetKind: 'driver', targetId: 'd7', reason: 'spam' }, 'driver', 'd7'),
    ).toThrow(ReporteInvalido);
    expect(() =>
      saneaReporte({ targetKind: 'passenger', targetId: 'u7', reason: 'spam' }, 'client', 'u7'),
    ).toThrow(ReporteInvalido);
  });

  it('pero un conductor sí puede reportar a OTRO conductor', () => {
    const r = saneaReporte(
      { targetKind: 'driver', targetId: 'd8', reason: 'spam' }, 'driver', 'd7',
    );
    expect(r.targetId).toBe('d8');
  });

  it('recorta el detalle largo en vez de rechazarlo', () => {
    // Rechazar por longitud le tira encima al usuario un error por algo que
    // podemos arreglar solos, y encima pierde el reporte entero.
    const largo = 'a'.repeat(MAX_DETALLE + 500);
    const r = saneaReporte({ ...ok, detail: largo }, 'client', 'u1');
    expect(r.detail!.length).toBe(MAX_DETALLE);
  });

  it('el detalle vacío queda en null, no en cadena vacía', () => {
    expect(saneaReporte({ ...ok, detail: '   ' }, 'client', 'u1').detail).toBeNull();
  });

  it('marca como urgente lo que hay que mirar hoy', () => {
    // La distinción existe para que quien modera vea primero lo que puede
    // acabar en una denuncia, no la queja de un domicilio frío.
    expect(saneaReporte({ ...ok, reason: 'conduccion_peligrosa' }, 'client', 'u1').urgente).toBe(true);
    expect(saneaReporte({ ...ok, reason: 'spam' }, 'client', 'u1').urgente).toBe(false);
    expect(MOTIVOS_URGENTES).toContain('acoso');
    expect(MOTIVOS_URGENTES).not.toContain('otro');
  });
});

describe('saneaBloqueo', () => {
  it('un cliente bloquea conductores', () => {
    const b = saneaBloqueo('client', 'u1', { kind: 'driver', id: 'd1' });
    expect(b).toEqual({
      blockerKind: 'client', blockerId: 'u1', blockedKind: 'driver', blockedId: 'd1',
    });
  });

  it('un conductor bloquea pasajeros', () => {
    expect(saneaBloqueo('driver', 'd1', { kind: 'client', id: 'u1' }).blockedKind).toBe('client');
  });

  it('un cliente NO puede bloquear a otro cliente', () => {
    // Sería un botón que no hace nada: dos pasajeros no coinciden nunca en un
    // servicio, así que el despacho no tendría qué evitar.
    expect(() => saneaBloqueo('client', 'u1', { kind: 'client', id: 'u2' }))
      .toThrow(ReporteInvalido);
  });

  it('exige a quién', () => {
    expect(() => saneaBloqueo('client', 'u1', { kind: 'driver', id: '' }))
      .toThrow(ReporteInvalido);
  });
});

describe('etiquetaMotivo', () => {
  it('traduce los del catálogo', () => {
    expect(etiquetaMotivo('acoso')).toBe(MOTIVOS['acoso']!.etiqueta);
  });

  it('un motivo retirado del catálogo no revienta la pantalla', () => {
    // Los reportes viejos guardan la clave que existía cuando se crearon. Si
    // esto lanzara, retirar un motivo tumbaría el panel de moderación entero
    // — que es justo donde se ven los reportes viejos.
    expect(etiquetaMotivo('motivo_de_2024')).toBe('motivo_de_2024');
  });
});
