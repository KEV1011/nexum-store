import { describe, it, expect } from 'vitest';
import { fuelEfficiency, type FuelReading } from './fuel-efficiency';

const D = (dia: number) => new Date(Date.UTC(2026, 7, dia, 8, 0, 0));

function tanqueo(
  vehicle: string, dia: number, odometerKm: number | null, gallons: number | null, amountCop = 0,
): FuelReading {
  return { vehicle, at: D(dia), odometerKm, gallons, amountCop };
}

describe('fuelEfficiency', () => {
  it('sin tanqueos no devuelve nada', () => {
    expect(fuelEfficiency([])).toEqual([]);
  });

  it('un solo tanqueo registra el gasto pero no puede medir rendimiento', () => {
    // No hay tramo anterior contra el cual medir: 0, no un número inventado.
    const [v] = fuelEfficiency([tanqueo('WGY123', 1, 10_000, 30, 450_000)]);
    expect(v!.fills).toBe(1);
    expect(v!.segments).toBe(0);
    expect(v!.kmPerGallon).toBe(0);
    expect(v!.spentCop).toBe(450_000);
  });

  it('calcula tanque a tanque: el tramo es del odómetro, los galones del segundo', () => {
    // 10.000 → 10.600 = 600 km con los 50 galones del segundo tanqueo.
    const [v] = fuelEfficiency([
      tanqueo('WGY123', 1, 10_000, 30, 400_000),
      tanqueo('WGY123', 5, 10_600, 50, 700_000),
    ]);
    expect(v!.segments).toBe(1);
    expect(v!.km).toBe(600);
    expect(v!.gallons).toBe(50);
    expect(v!.kmPerGallon).toBe(12);
    // El costo por km usa TODO lo gastado: la plata del primer tanqueo salió.
    expect(v!.spentCop).toBe(1_100_000);
    expect(v!.costPerKm).toBe(Math.round(1_100_000 / 600));
  });

  it('acumula varios tramos del mismo camión', () => {
    const [v] = fuelEfficiency([
      tanqueo('WGY123', 1, 10_000, 30),
      tanqueo('WGY123', 5, 10_500, 50),
      tanqueo('WGY123', 9, 11_100, 50),
    ]);
    expect(v!.segments).toBe(2);
    expect(v!.km).toBe(1100);
    expect(v!.gallons).toBe(100);
    expect(v!.kmPerGallon).toBe(11);
  });

  it('descarta el tramo si el odómetro retrocede, no el vehículo', () => {
    // Cambio de tablero o dato mal escrito.
    const [v] = fuelEfficiency([
      tanqueo('WGY123', 1, 90_000, 40),
      tanqueo('WGY123', 3, 500, 40),      // retrocede: tramo descartado
      tanqueo('WGY123', 6, 1_100, 50),    // este sí vale: 600 km / 50 gal
    ]);
    expect(v!.segments).toBe(1);
    expect(v!.kmPerGallon).toBe(12);
  });

  it('descarta un tramo imposible por error de digitación', () => {
    // Un cero de más arruinaría el promedio de todo el mes.
    const [v] = fuelEfficiency([
      tanqueo('WGY123', 1, 10_000, 40),
      tanqueo('WGY123', 4, 100_000, 50), // 90.000 km entre tanqueos
    ]);
    expect(v!.segments).toBe(0);
    expect(v!.kmPerGallon).toBe(0);
  });

  it('ignora tanqueos sin odómetro pero cuenta su gasto', () => {
    const [v] = fuelEfficiency([
      tanqueo('WGY123', 1, null, 40, 500_000),
      tanqueo('WGY123', 4, 10_000, 40, 500_000),
      tanqueo('WGY123', 8, 10_400, 40, 500_000),
    ]);
    expect(v!.segments).toBe(1);
    expect(v!.km).toBe(400);
    expect(v!.spentCop).toBe(1_500_000);
  });

  it('no mezcla camiones distintos', () => {
    const res = fuelEfficiency([
      tanqueo('WGY123', 1, 10_000, 30),
      tanqueo('WGY123', 5, 10_600, 50), // 12 km/gal
      tanqueo('SXA987', 1, 50_000, 30),
      tanqueo('SXA987', 5, 50_300, 50), // 6 km/gal
    ]);
    expect(res).toHaveLength(2);
    // Ordenados del más eficiente al menos: el peor queda a la vista abajo.
    expect(res[0]!.vehicle).toBe('WGY123');
    expect(res[0]!.kmPerGallon).toBe(12);
    expect(res[1]!.vehicle).toBe('SXA987');
    expect(res[1]!.kmPerGallon).toBe(6);
  });

  it('ordena por tiempo aunque los tanqueos lleguen desordenados', () => {
    const res = fuelEfficiency([
      tanqueo('WGY123', 9, 11_100, 50),
      tanqueo('WGY123', 1, 10_000, 30),
      tanqueo('WGY123', 5, 10_500, 50),
    ]);
    expect(res[0]!.segments).toBe(2);
    expect(res[0]!.km).toBe(1100);
  });
});
