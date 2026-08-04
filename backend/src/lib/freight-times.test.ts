import { describe, it, expect } from 'vitest';
import { freightTimes, onTimeStats } from './freight-times';

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 4, h, m, 0));

describe('freightTimes', () => {
  it('un flete recién publicado no inventa duraciones', () => {
    const t = freightTimes({ createdAt: T(6) });
    expect(t).toEqual({
      toAcceptMin: null, waitMin: null, transitMin: null,
      totalMin: null, onTime: null, lateMin: null,
    });
  });

  it('separa la espera en bodega del tiempo en ruta', () => {
    // Publicado 6:00, tomado 6:30, sale 8:00, entrega 12:00.
    // Sin startedAt esas dos horas de bodega se leerían como viaje.
    const t = freightTimes({
      createdAt: T(6), acceptedAt: T(6, 30), startedAt: T(8), completedAt: T(12),
    });
    expect(t.toAcceptMin).toBe(30);
    expect(t.waitMin).toBe(90);
    expect(t.transitMin).toBe(240);
    expect(t.totalMin).toBe(360);
  });

  it('un flete viejo sin startedAt devuelve null, no cero', () => {
    // Cero significaría "salió al instante", que es una afirmación falsa.
    const t = freightTimes({ createdAt: T(6), acceptedAt: T(7), completedAt: T(11) });
    expect(t.waitMin).toBeNull();
    expect(t.transitMin).toBeNull();
    expect(t.totalMin).toBe(300);
  });

  it('sin fecha comprometida no hay veredicto de cumplimiento', () => {
    const t = freightTimes({ createdAt: T(6), startedAt: T(7), completedAt: T(11) });
    expect(t.onTime).toBeNull();
    expect(t.lateMin).toBeNull();
  });

  it('entrega dentro de lo prometido = a tiempo, sin retraso', () => {
    const t = freightTimes({ createdAt: T(6), completedAt: T(11), promisedAt: T(12) });
    expect(t.onTime).toBe(true);
    expect(t.lateMin).toBe(0);
  });

  it('entrega tarde mide el retraso exacto', () => {
    const t = freightTimes({ createdAt: T(6), completedAt: T(13, 45), promisedAt: T(12) });
    expect(t.onTime).toBe(false);
    expect(t.lateMin).toBe(105);
  });

  it('justo en la hora comprometida cuenta como a tiempo', () => {
    const t = freightTimes({ createdAt: T(6), completedAt: T(12), promisedAt: T(12) });
    expect(t.onTime).toBe(true);
  });

  it('una marca de tiempo invertida devuelve null en vez de un negativo', () => {
    // Reloj torcido o dato migrado a mano: "-15 min en ruta" no se puede leer.
    const t = freightTimes({ createdAt: T(6), startedAt: T(10), completedAt: T(9) });
    expect(t.transitMin).toBeNull();
  });
});

describe('onTimeStats', () => {
  it('sin fletes medibles no inventa un 100 %', () => {
    const s = onTimeStats([{ createdAt: T(6), completedAt: T(9) }]); // sin promesa
    expect(s.measured).toBe(0);
    expect(s.pct).toBe(0);
  });

  it('solo cuenta los que tenían fecha comprometida', () => {
    const s = onTimeStats([
      { createdAt: T(6), completedAt: T(11), promisedAt: T(12) }, // a tiempo
      { createdAt: T(6), completedAt: T(14), promisedAt: T(12) }, // tarde 120
      { createdAt: T(6), completedAt: T(9) },                     // sin promesa: fuera
      { createdAt: T(6), promisedAt: T(12) },                     // sin entregar: fuera
    ]);
    expect(s.measured).toBe(2);
    expect(s.onTime).toBe(1);
    expect(s.late).toBe(1);
    expect(s.pct).toBe(50);
    expect(s.avgLateMin).toBe(120);
  });

  it('promedia el retraso solo entre los tardíos', () => {
    const s = onTimeStats([
      { createdAt: T(6), completedAt: T(13), promisedAt: T(12) }, // 60
      { createdAt: T(6), completedAt: T(15), promisedAt: T(12) }, // 180
      { createdAt: T(6), completedAt: T(10), promisedAt: T(12) }, // a tiempo
    ]);
    expect(s.avgLateMin).toBe(120);
    expect(s.pct).toBe(33);
  });
});
