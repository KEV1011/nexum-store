import { describe, it, expect } from 'vitest';
import { shouldRecord, summarizeTrack, haversineM } from './track.service';

// Pamplona, N. de Santander. Puntos reales para que las distancias signifiquen algo.
const BASE = { lat: 7.3754, lng: -72.6486 };

/** Desplaza un punto ~metros hacia el norte (1° lat ≈ 110.574 m). */
function norte(lat: number, metros: number): number {
  return lat + metros / 110574;
}

describe('haversineM', () => {
  it('mide cero contra sí mismo', () => {
    expect(haversineM(BASE.lat, BASE.lng, BASE.lat, BASE.lng)).toBe(0);
  });

  it('mide ~1 km con margen del 1%', () => {
    const d = haversineM(BASE.lat, BASE.lng, norte(BASE.lat, 1000), BASE.lng);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});

describe('shouldRecord — la regla que gobierna el volumen de la tabla', () => {
  const t0 = 1_000_000_000_000;
  const prev = { lat: BASE.lat, lng: BASE.lng, at: t0, serviceId: 'f1' };

  it('el primer punto de un servicio siempre se graba', () => {
    expect(shouldRecord(undefined, 'f1', BASE.lat, BASE.lng, t0)).toBe(true);
  });

  it('un servicio distinto arranca traza nueva aunque no se haya movido', () => {
    expect(shouldRecord(prev, 'f2', BASE.lat, BASE.lng, t0 + 1000)).toBe(true);
  });

  it('el heartbeat de 4 s NO genera fila: es el antirrebote', () => {
    // Sin esto serían ~900 filas por hora y conductor, casi todas repetidas.
    const movido = norte(BASE.lat, 500);
    expect(shouldRecord(prev, 'f1', movido, BASE.lng, t0 + 4000)).toBe(false);
  });

  it('se graba cuando el camión se movió de verdad', () => {
    const movido = norte(BASE.lat, 200); // > 75 m
    expect(shouldRecord(prev, 'f1', movido, BASE.lng, t0 + 30_000)).toBe(true);
  });

  it('quieto y con poco tiempo, no se graba', () => {
    const casiIgual = norte(BASE.lat, 10); // < 75 m
    expect(shouldRecord(prev, 'f1', casiIgual, BASE.lng, t0 + 60_000)).toBe(false);
  });

  it('quieto pero pasados 5 min SÍ se graba: hay que poder probar la parada', () => {
    const casiIgual = norte(BASE.lat, 10);
    expect(shouldRecord(prev, 'f1', casiIgual, BASE.lng, t0 + 301_000)).toBe(true);
  });
});

describe('summarizeTrack', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 7, 4, 8, min, 0));

  it('sin puntos devuelve el resumen vacío, no revienta', () => {
    const s = summarizeTrack([]);
    expect(s.points).toBe(0);
    expect(s.distanceKm).toBe(0);
    expect(s.avgKmh).toBe(0);
    expect(s.startedAt).toBeNull();
  });

  it('un solo punto: hay traza pero no hay tramo ni duración', () => {
    const s = summarizeTrack([{ lat: BASE.lat, lng: BASE.lng, at: t(0), metersFromPrev: null }]);
    expect(s.points).toBe(1);
    expect(s.distanceKm).toBe(0);
    expect(s.durationMin).toBe(0);
  });

  it('suma los tramos reales, no la línea recta origen→destino', () => {
    // Ida y vuelta: la recta daría 0 km, el recorrido real son 4 km.
    const s = summarizeTrack([
      { lat: BASE.lat, lng: BASE.lng, at: t(0), metersFromPrev: null },
      { lat: norte(BASE.lat, 2000), lng: BASE.lng, at: t(30), metersFromPrev: 2000 },
      { lat: BASE.lat, lng: BASE.lng, at: t(60), metersFromPrev: 2000 },
    ]);
    expect(s.distanceKm).toBe(4);
    expect(s.durationMin).toBe(60);
  });

  it('separa el tiempo detenido del tiempo en movimiento', () => {
    // 30 min rodando 20 km, luego 40 min parado en el mismo sitio.
    const s = summarizeTrack([
      { lat: BASE.lat, lng: BASE.lng, at: t(0), metersFromPrev: null },
      { lat: norte(BASE.lat, 20000), lng: BASE.lng, at: t(30), metersFromPrev: 20000 },
      { lat: norte(BASE.lat, 20010), lng: BASE.lng, at: t(70), metersFromPrev: 10 },
    ]);
    expect(s.distanceKm).toBe(20.01);
    expect(s.durationMin).toBe(70);
    expect(s.stoppedMin).toBe(40);
    // El promedio se calcula sobre los 30 min en movimiento (40 km/h), no
    // sobre los 70 totales — incluir la parada describiría mal cómo condujo.
    expect(s.avgKmh).toBeCloseTo(40, 1);
  });

  it('si falta metersFromPrev lo recalcula con las coordenadas', () => {
    // Los puntos viejos o un fallo al grabar no deben dejar el recorrido en cero.
    const s = summarizeTrack([
      { lat: BASE.lat, lng: BASE.lng, at: t(0), metersFromPrev: null },
      { lat: norte(BASE.lat, 1000), lng: BASE.lng, at: t(10), metersFromPrev: null },
    ]);
    expect(s.distanceKm).toBeGreaterThan(0.98);
    expect(s.distanceKm).toBeLessThan(1.02);
  });

  it('un camión siempre detenido no divide por cero', () => {
    const s = summarizeTrack([
      { lat: BASE.lat, lng: BASE.lng, at: t(0), metersFromPrev: null },
      { lat: BASE.lat, lng: BASE.lng, at: t(20), metersFromPrev: 0 },
    ]);
    expect(s.avgKmh).toBe(0);
    expect(s.stoppedMin).toBe(20);
  });
});
