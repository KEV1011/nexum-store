import { describe, it, expect } from 'vitest';
import {
  plantillaDe,
  sillasDe,
  sillasLibres,
  motivoParaNoReservar,
  esTipoConSillas,
  FILAS_MIN,
  FILAS_MAX,
} from './mapa-asientos';

describe('la plantilla del vehículo', () => {
  it('numera de adelante hacia atrás, sin saltos ni repetidos', () => {
    // La numeración es la que está pintada en el tubo del asiento. Si la app
    // numerara de otra forma, el pasajero pide la 5, se sienta en la 7 y la
    // discusión es a bordo contra el conductor.
    for (const tipo of ['VAN', 'BUSETA', 'BUS'] as const) {
      const n = sillasDe(tipo);
      expect(n).toEqual([...Array(n.length)].map((_, i) => i + 1));
    }
  });

  it('cada tipo tiene el porte que le toca', () => {
    // Una van no puede tener más sillas que un bus: el mapa sería una mentira
    // sobre qué se está comprando.
    const van = plantillaDe('VAN').sillas;
    const buseta = plantillaDe('BUSETA').sillas;
    const bus = plantillaDe('BUS').sillas;
    expect(van).toBeLessThan(buseta);
    expect(buseta).toBeLessThan(bus);
  });

  it('el pasillo parte la fila y no se vende', () => {
    const p = plantillaDe('BUS');
    const filaPasajeros = p.filas[2]!;
    expect(filaPasajeros.some((c) => c.tipo === 'pasillo')).toBe(true);
    expect(filaPasajeros.filter((c) => c.tipo === 'silla')).toHaveLength(4);
  });

  it('dibuja al conductor y la puerta, que no son sillas', () => {
    // Sin la cabina el mapa no tiene orientación y elegir «adelante» es una
    // lotería.
    const p = plantillaDe('BUSETA');
    const cabina = p.filas[0]!;
    expect(cabina.some((c) => c.tipo === 'conductor')).toBe(true);
    expect(cabina.some((c) => c.tipo === 'puerta')).toBe(true);
    expect(cabina.some((c) => c.tipo === 'silla')).toBe(false);
  });

  it('todas las filas tienen el mismo ancho', () => {
    // Si una fila fuera más corta, el mapa se dibujaría torcido y las sillas
    // no cuadrarían con las de al lado.
    for (const tipo of ['VAN', 'BUSETA', 'BUS'] as const) {
      const p = plantillaDe(tipo);
      for (const fila of p.filas) expect(fila).toHaveLength(p.columnas);
    }
  });

  it('el número de filas se acota', () => {
    // Una buseta de 40 filas no existe, y una de cero tampoco. Un valor
    // absurdo del portal no puede generar un mapa imposible.
    expect(plantillaDe('BUSETA', 0).filas.length).toBe(FILAS_MIN + 1); // +cabina
    expect(plantillaDe('BUSETA', 999).filas.length).toBe(FILAS_MAX + 1);
    expect(plantillaDe('BUSETA', 2.7).sillas).toBe(plantillaDe('BUSETA', 2).sillas);
  });

  it('reconoce solo los tipos que llevan pasajeros', () => {
    expect(esTipoConSillas('BUS')).toBe(true);
    expect(esTipoConSillas('MULA')).toBe(false);
    expect(esTipoConSillas('moto')).toBe(false);
    expect(esTipoConSillas(null)).toBe(false);
  });
});

describe('qué selección se acepta', () => {
  const base = { tipo: 'BUSETA' as const, ocupadas: [] as number[] };

  it('una silla libre pasa', () => {
    expect(motivoParaNoReservar({ ...base, pedidas: [3] })).toBeNull();
  });

  it('sin elegir nada, no', () => {
    expect(motivoParaNoReservar({ ...base, pedidas: [] })).toMatch(/al menos una/i);
  });

  it('una silla que no existe, no — y dice cuál', () => {
    const m = motivoParaNoReservar({ ...base, pedidas: [999] });
    expect(m).toContain('999');
    expect(m).toMatch(/no existe/i);
  });

  it('una silla ya vendida, no — y dice cuál, para poder elegir otra', () => {
    const m = motivoParaNoReservar({ ...base, ocupadas: [4], pedidas: [4, 5] });
    expect(m).toContain('4');
    expect(m).toMatch(/tomada/i);
  });

  it('la misma silla dos veces en el mismo pedido, no', () => {
    // Pasa de verdad: se toca dos veces en el mapa y se enviaría duplicada,
    // cobrando dos puestos y ocupando uno.
    expect(motivoParaNoReservar({ ...base, pedidas: [2, 2] })).toMatch(/repetida/i);
  });
});

describe('cuántas quedan', () => {
  it('se calcula de las ocupadas, no de un contador', () => {
    const total = plantillaDe('VAN').sillas;
    expect(sillasLibres('VAN', [])).toBe(total);
    expect(sillasLibres('VAN', [1, 2])).toBe(total - 2);
  });

  it('una silla ocupada que no existe no descuenta', () => {
    // Un dato sucio en la base no puede hacer que el vehículo aparezca con
    // menos puestos de los que tiene.
    const total = plantillaDe('VAN').sillas;
    expect(sillasLibres('VAN', [999])).toBe(total);
  });
});
