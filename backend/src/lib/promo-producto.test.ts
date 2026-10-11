/**
 * La promoción de un producto, con su fecha de fin.
 *
 * La prueba que justifica el fichero es la de la vigencia: una promoción que
 * hay que acordarse de quitar se queda puesta en marzo. Ya pasó con la de la
 * tienda, y por eso aquélla tiene vigencia.
 */
import { describe, it, expect } from 'vitest';
import {
  faltaPara,
  precioVigente,
  saneaFinDePromo,
} from './promo-producto';

const AHORA = new Date('2026-06-15T12:00:00Z');
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

describe('el precio que rige ahora', () => {
  it('sin precio tachado, se cobra el precio puesto', () => {
    expect(precioVigente({ price: 18000 }, AHORA))
      .toEqual({ precio: 18000, antes: null, enPromo: false });
  });

  it('con promoción viva, se cobra el rebajado y se tacha el normal', () => {
    expect(precioVigente(
      { price: 12000, compareAtPrice: 18000, promoUntil: dias(2) }, AHORA,
    )).toEqual({ precio: 12000, antes: 18000, enPromo: true });
  });

  it('VENCIDA, el producto vuelve SOLO a su precio normal', () => {
    // Es la razón de existir de todo esto. Sin la fecha, la promoción del fin
    // de semana sigue puesta en marzo y el dueño la descubre por el margen.
    expect(precioVigente(
      { price: 12000, compareAtPrice: 18000, promoUntil: dias(-1) }, AHORA,
    )).toEqual({ precio: 18000, antes: null, enPromo: false });
  });

  it('sin fecha, la promoción sigue viva: es el comportamiento de hoy', () => {
    // Los productos ya cargados no tienen `promoUntil`, y no pueden cambiar de
    // precio el día del despliegue.
    expect(precioVigente({ price: 12000, compareAtPrice: 18000 }, AHORA))
      .toEqual({ precio: 12000, antes: 18000, enPromo: true });
    expect(precioVigente({ price: 12000, compareAtPrice: 18000, promoUntil: null }, AHORA).enPromo)
      .toBe(true);
  });

  it('una fecha ilegible NO vence la promoción', () => {
    // Darla por vencida subiría el precio de golpe por un dato roto, y el
    // cliente que vio el descuento pagaría más en la caja. El error barato es
    // dejar un descuento de más un rato; el caro es cobrar de más.
    expect(precioVigente(
      { price: 12000, compareAtPrice: 18000, promoUntil: 'el viernes' }, AHORA,
    ).enPromo).toBe(true);
  });

  it('un «antes» que no es mayor se ignora, no se cobra', () => {
    // Si `compareAtPrice` quedara por debajo del precio, volver a él al vencer
    // REBAJARÍA el producto para siempre.
    expect(precioVigente(
      { price: 18000, compareAtPrice: 12000, promoUntil: dias(-1) }, AHORA,
    )).toEqual({ precio: 18000, antes: null, enPromo: false });
  });

  it('justo al segundo de vencer ya no hay promoción', () => {
    expect(precioVigente(
      { price: 12000, compareAtPrice: 18000, promoUntil: AHORA }, AHORA,
    ).enPromo).toBe(false);
  });
});

describe('cuánto falta', () => {
  it('lo dice en palabras, no en milisegundos', () => {
    expect(faltaPara(dias(0.5), AHORA)).toBe('hoy');
    expect(faltaPara(dias(1.5), AHORA)).toBe('mañana');
    expect(faltaPara(dias(5), AHORA)).toBe('5 días');
  });

  it('vencida o ausente no dice nada', () => {
    expect(faltaPara(dias(-1), AHORA)).toBeNull();
    expect(faltaPara(null, AHORA)).toBeNull();
    expect(faltaPara('cuando sea', AHORA)).toBeNull();
  });
});

describe('la fecha que escribe el dueño', () => {
  it('se acepta una futura', () => {
    expect(saneaFinDePromo(dias(3).toISOString(), AHORA)?.getTime())
      .toBe(dias(3).getTime());
  });

  it('vacía = sin fecha de fin', () => {
    expect(saneaFinDePromo('', AHORA)).toBeNull();
    expect(saneaFinDePromo(null, AHORA)).toBeNull();
  });

  it('una fecha YA PASADA se rechaza', () => {
    // Guardarla dejaría una promoción que nace muerta: el dueño vería su
    // producto sin descuento y creería que el portal no guardó.
    expect(() => saneaFinDePromo(dias(-1).toISOString(), AHORA))
      .toThrow(/antes de empezar/i);
  });

  it('más de un año es un año mal escrito', () => {
    expect(() => saneaFinDePromo(dias(400).toISOString(), AHORA))
      .toThrow(/más de un año/i);
  });

  it('lo que no es fecha se rechaza diciéndolo', () => {
    expect(() => saneaFinDePromo('el viernes', AHORA)).toThrow(/no se entiende/i);
  });
});
