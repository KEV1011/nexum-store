import { describe, it, expect } from 'vitest';
import {
  totalDeCuenta,
  rondasDeCuenta,
  motivoParaNoAnadir,
  motivoParaNoCerrar,
  siguienteNumero,
  etiquetaDeCuenta,
  lineasImpresas,
} from './cuenta-mesa';

const ronda = (total: number, status = 'DELIVERED') => ({ id: `o${total}`, status, total });

describe('la cuenta de una mesa', () => {
  describe('el total', () => {
    it('suma todas las rondas', () => {
      // El caso del reporte: 68.000 y después algo más, en la misma cuenta.
      expect(totalDeCuenta([ronda(68000), ronda(12000), ronda(8000)])).toBe(88000);
    });

    it('no suma lo cancelado', () => {
      // El cliente no se lo comió y nadie va a pagarlo.
      expect(totalDeCuenta([ronda(68000), ronda(12000, 'CANCELLED')])).toBe(68000);
    });

    it('una mesa sin consumo debe cero', () => {
      expect(totalDeCuenta([])).toBe(0);
    });

    it('cuenta las rondas que de verdad valen', () => {
      expect(rondasDeCuenta([ronda(1000), ronda(2000, 'CANCELLED'), ronda(3000)])).toBe(2);
    });
  });

  describe('añadir una ronda', () => {
    it('a una cuenta abierta se puede', () => {
      expect(motivoParaNoAnadir({ closedAt: null })).toBeNull();
    });

    it('a una cerrada NO, y se dice qué pasa en su lugar', () => {
      // Meter la ronda en una cuenta ya cobrada haría reaparecer un total
      // que el cliente ya saldó.
      const m = motivoParaNoAnadir({ closedAt: new Date() });
      expect(m).not.toBeNull();
      expect(m).toMatch(/cuenta nueva/i);
    });
  });

  describe('cerrar', () => {
    it('con consumo se puede', () => {
      expect(motivoParaNoCerrar({ closedAt: null, pedidos: [ronda(5000)] })).toBeNull();
    });

    it('sin consumo NO: no hay nada que cobrar', () => {
      expect(motivoParaNoCerrar({ closedAt: null, pedidos: [] })).toMatch(/no ha consumido/i);
    });

    it('con todo cancelado tampoco', () => {
      const m = motivoParaNoCerrar({ closedAt: null, pedidos: [ronda(5000, 'CANCELLED')] });
      expect(m).toMatch(/no ha consumido/i);
    });

    it('dos veces no', () => {
      expect(
        motivoParaNoCerrar({ closedAt: new Date(), pedidos: [ronda(5000)] }),
      ).toMatch(/ya está cerrada/i);
    });

    it('NO exige que todo esté servido', () => {
      // El cliente pide la cuenta mientras le traen el postre. Bloquear el
      // cobro dejaría al mesero esperando con el datáfono en la mano.
      expect(
        motivoParaNoCerrar({ closedAt: null, pedidos: [ronda(5000, 'PREPARING')] }),
      ).toBeNull();
    });
  });

  describe('el número', () => {
    it('empieza en 1 cada día', () => {
      expect(siguienteNumero([])).toBe(1);
    });

    it('sigue al mayor, no al conteo', () => {
      // Con una cuenta anulada en medio, contar daría un número repetido.
      expect(siguienteNumero([1, 2, 5])).toBe(6);
    });

    it('se lee como lo canta un mesero', () => {
      expect(etiquetaDeCuenta({ numero: 14, tableLabel: 'Terraza 2' }))
        .toBe('Cuenta 14 · Mesa Terraza 2');
    });
  });

  describe('las líneas del impreso', () => {
    const linea = (
      productName: string,
      quantity: number,
      unitPrice: number,
      optionsSummary: string | null = null,
      notes: string | null = null,
    ) => ({ productName, quantity, unitPrice, optionsSummary, notes });

    it('junta el mismo plato pedido en dos rondas', () => {
      const r = lineasImpresas([
        { status: 'DELIVERED', lines: [linea('Cerveza', 1, 6000)] },
        { status: 'PREPARING', lines: [linea('Cerveza', 1, 6000)] },
      ]);
      expect(r).toHaveLength(1);
      expect(r[0]!.cantidad).toBe(2);
      expect(r[0]!.subtotal).toBe(12000);
    });

    it('NO junta el mismo plato con opciones distintas', () => {
      // Una hamburguesa sin cebolla y otra con no son la misma línea:
      // fundirlas escondería justo lo que el cliente va a revisar.
      const r = lineasImpresas([
        { status: 'DELIVERED', lines: [
          linea('Hamburguesa', 1, 20000, null, 'Sin cebolla'),
          linea('Hamburguesa', 1, 20000),
        ] },
      ]);
      expect(r).toHaveLength(2);
    });

    it('NO junta si el precio cambió entre rondas', () => {
      // Juntarlas daría un subtotal que no cuadra con ninguno de los dos
      // precios, y el cliente tendría razón al reclamar.
      const r = lineasImpresas([
        { status: 'DELIVERED', lines: [linea('Jugo', 1, 5000)] },
        { status: 'DELIVERED', lines: [linea('Jugo', 1, 6000)] },
      ]);
      expect(r).toHaveLength(2);
      expect(r.map((l) => l.unitario).sort()).toEqual([5000, 6000]);
    });

    it('deja fuera las rondas canceladas', () => {
      const r = lineasImpresas([
        { status: 'CANCELLED', lines: [linea('Pizza', 2, 30000)] },
        { status: 'DELIVERED', lines: [linea('Cerveza', 1, 6000)] },
      ]);
      expect(r).toHaveLength(1);
      expect(r[0]!.nombre).toBe('Cerveza');
    });

    it('el detalle junta opciones y notas', () => {
      const r = lineasImpresas([
        { status: 'DELIVERED', lines: [linea('Picada', 1, 40000, 'Grande', 'Sin chorizo')] },
      ]);
      expect(r[0]!.detalle).toBe('Grande · Sin chorizo');
    });

    it('el subtotal de la línea cuadra con su cantidad', () => {
      // Si esto se desviara, el total del papel no cuadraría con sus propios
      // renglones y el cliente lo vería antes que nadie.
      const r = lineasImpresas([
        { status: 'DELIVERED', lines: [linea('Empanada', 3, 2500)] },
      ]);
      expect(r[0]!.subtotal).toBe(r[0]!.cantidad * r[0]!.unitario);
    });

    it('una cuenta sin nada no da líneas', () => {
      expect(lineasImpresas([])).toEqual([]);
    });
  });
});
