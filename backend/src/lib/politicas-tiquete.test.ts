import { describe, it, expect } from 'vitest';
import {
  saneaPoliticas,
  politicasGuardadas,
  hayPoliticas,
  lineasDePolitica,
} from './politicas-tiquete';

describe('sin declarar no se inventa nada', () => {
  it('nada declarado es null, no un objeto vacío', () => {
    // La distinción sostiene el mensaje honesto de la app: «la empresa no ha
    // publicado sus políticas» en vez de una tarjeta en blanco.
    expect(saneaPoliticas(null)).toBeNull();
    expect(saneaPoliticas({})).toBeNull();
    expect(saneaPoliticas({ equipajeKg: '', mascotas: '' })).toBeNull();
    expect(hayPoliticas(null)).toBe(false);
  });

  it('sin políticas no hay ninguna línea que pintar', () => {
    // Un valor por defecto («2 piezas de 20 kg») sería una condición que la
    // empresa no fijó, publicada en su nombre y reclamable.
    expect(lineasDePolitica(null)).toEqual([]);
    expect(lineasDePolitica(saneaPoliticas({}))).toEqual([]);
  });
});

describe('los topes de cordura', () => {
  it('un cero de más en el equipaje se rechaza', () => {
    expect(() => saneaPoliticas({ equipajeKg: 500 })).toThrow(/100/);
    expect(() => saneaPoliticas({ equipajePiezas: 40 })).toThrow(/10/);
  });

  it('cancelar con un mes de antelación no es una política, es un dedo', () => {
    expect(() => saneaPoliticas({ cancelacionHoras: 5000 })).toThrow(/168/);
  });

  it('un negativo se rechaza', () => {
    expect(() => saneaPoliticas({ equipajeKg: -5 })).toThrow(/negativo/i);
  });

  it('un valor de lista desconocido se rechaza', () => {
    expect(() => saneaPoliticas({ mascotas: 'a veces' })).toThrow(/mascotas/i);
    expect(() => saneaPoliticas({ menores: 'quizá' })).toThrow(/menores/i);
  });

  it('el número escrito como texto se acepta: el formulario manda cadenas', () => {
    expect(saneaPoliticas({ equipajeKg: '25' })).toEqual({ equipajeKg: 25 });
  });

  it('las notas se recortan en vez de rechazarse', () => {
    const p = saneaPoliticas({ notas: 'x'.repeat(900) });
    expect(p?.notas?.length).toBe(500);
  });
});

describe('cómo se redacta', () => {
  it('el equipaje junta piezas y kilos en una sola frase', () => {
    const l = lineasDePolitica(saneaPoliticas({ equipajePiezas: 2, equipajeKg: 20 }));
    expect(l[0]).toBe('Equipaje incluido: 2 piezas de hasta 20 kg por pasajero.');
  });

  it('una sola pieza no dice «1 piezas»', () => {
    const l = lineasDePolitica(saneaPoliticas({ equipajePiezas: 1, equipajeKg: 15 }));
    expect(l[0]).toContain('1 pieza de hasta 15 kg');
  });

  it('con solo los kilos también se entiende', () => {
    expect(lineasDePolitica(saneaPoliticas({ equipajeKg: 20 }))[0]).toBe(
      'Equipaje incluido: 20 kg por pasajero.',
    );
  });

  it('la cancelación NO promete devolver el dinero', () => {
    // El tiquete no se paga en la plataforma: `SeatBooking` no tiene ningún
    // campo de dinero. Prometer un reembolso que este sistema no puede
    // ejecutar es la peor de las mentiras posibles, porque involucra plata.
    const l = lineasDePolitica(saneaPoliticas({ cancelacionHoras: 4 }));
    expect(l[0]).toContain('4 horas antes');
    expect(l[0]).toMatch(/se acuerda con la empresa/i);
    expect(l.join(' ')).not.toMatch(/te devolvemos|reembolso autom/i);
  });

  it('cancelar hasta la hora de salida se dice, no se calla', () => {
    expect(lineasDePolitica(saneaPoliticas({ cancelacionHoras: 0 }))[0]).toContain(
      'hasta la hora de salida',
    );
  });

  it('cada regla declarada da exactamente una línea', () => {
    const p = saneaPoliticas({
      equipajeKg: 20,
      equipajePiezas: 2,
      mascotas: 'transportin',
      menores: 'con_autorizacion',
      cancelacionHoras: 2,
      notas: 'Presentarse 20 minutos antes.',
    });
    expect(lineasDePolitica(p)).toHaveLength(5);
    expect(lineasDePolitica(p).at(-1)).toBe('Presentarse 20 minutos antes.');
  });
});

describe('lo que ya está guardado', () => {
  it('un valor corrupto no revienta la consulta de la salida', () => {
    // Al revés que el formulario: aquí el dato ya está en la base y tirar la
    // búsqueda entera por él dejaría al pasajero sin ver ninguna salida.
    expect(politicasGuardadas({ equipajeKg: 'muchísimo' })).toBeNull();
    expect(politicasGuardadas('texto suelto')).toBeNull();
  });
});
