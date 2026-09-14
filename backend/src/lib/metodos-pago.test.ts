import { describe, it, expect } from 'vitest';
import {
  METODOS_DE_PAGO,
  metodoPorValor,
  metodosDisponibles,
  saneaMetodoPago,
} from './metodos-pago';

describe('saneaMetodoPago', () => {
  it('acepta los métodos del catálogo', () => {
    for (const m of METODOS_DE_PAGO) {
      expect(saneaMetodoPago(m.valor)).toBe(m.valor);
    }
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(saneaMetodoPago('  Nequi ')).toBe('nequi');
    expect(saneaMetodoPago('EN_LINEA')).toBe('en_linea');
  });

  it('descarta lo que no reconoce en vez de guardarlo', () => {
    expect(saneaMetodoPago('bitcoin')).toBeNull();
    expect(saneaMetodoPago('')).toBeNull();
    expect(saneaMetodoPago(undefined)).toBeNull();
    expect(saneaMetodoPago(null)).toBeNull();
  });

  it('sigue aceptando "transferencia": es lo que mandan las apps instaladas', () => {
    // Quitarlo dejaría sin método a los viajes ya sellados y sin poder elegir
    // a quien no haya actualizado.
    expect(saneaMetodoPago('transferencia')).toBe('transferencia');
  });
});

describe('catálogo', () => {
  it('no repite valores', () => {
    const valores = METODOS_DE_PAGO.map((m) => m.valor);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('todo método tiene etiqueta y detalle', () => {
    for (const m of METODOS_DE_PAGO) {
      expect(m.etiqueta.trim().length).toBeGreaterThan(0);
      expect(m.detalle.trim().length).toBeGreaterThan(0);
    }
  });

  it('SOLO el pago en línea le dice al conductor que ya está pagado', () => {
    // Esta es la que cuesta dinero: si una transferencia le dijera "ya
    // pagado", el conductor deja bajarse al pasajero sin cobrar.
    const yaPagado = METODOS_DE_PAGO.filter(
      (m) => m.avisoAlConductor?.toLowerCase().includes('pagado'),
    );
    expect(yaPagado.map((m) => m.valor)).toEqual(['en_linea']);
  });

  it('solo cobra la plataforma cuando hay pasarela de por medio', () => {
    for (const m of METODOS_DE_PAGO) {
      if (m.quienCobra === 'plataforma') expect(m.exigePasarela).toBe(true);
      else expect(m.exigePasarela).toBe(false);
    }
  });

  it('el efectivo no le aclara nada al conductor: es lo que ya espera', () => {
    expect(metodoPorValor('efectivo')!.avisoAlConductor).toBeNull();
  });

  it('cada billetera dice al conductor CUÁL es, no un genérico', () => {
    expect(metodoPorValor('nequi')!.avisoAlConductor).toContain('Nequi');
    expect(metodoPorValor('daviplata')!.avisoAlConductor).toContain('Daviplata');
    expect(metodoPorValor('bancolombia')!.avisoAlConductor).toContain('Bancolombia');
  });
});

describe('metodosDisponibles', () => {
  it('sin pasarela no se ofrece el pago en línea', () => {
    const valores = metodosDisponibles(false).map((m) => m.valor);
    expect(valores).not.toContain('en_linea');
    expect(valores).toContain('efectivo');
    expect(valores).toContain('nequi');
  });

  it('con pasarela se ofrecen todos', () => {
    expect(metodosDisponibles(true)).toHaveLength(METODOS_DE_PAGO.length);
  });

  it('el efectivo siempre está: es el único que no depende de nada', () => {
    for (const activa of [true, false]) {
      expect(metodosDisponibles(activa).some((m) => m.valor === 'efectivo')).toBe(true);
    }
  });
});

describe('metodoPorValor', () => {
  it('devuelve null para lo desconocido en vez de reventar', () => {
    expect(metodoPorValor('paypal')).toBeNull();
  });
});
