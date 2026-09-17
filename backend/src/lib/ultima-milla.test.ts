import { describe, it, expect } from 'vitest';
import { desgloseEnvio, motivoParaNoLlevarAPuerta, puntoDeEntrega } from './ultima-milla';

describe('cuánto se cobra por mover la caja', () => {
  it('pedido local: el domicilio de siempre', () => {
    expect(desgloseEnvio({ deliveryFee: 4000, intercityFee: null, intercity: false, lastMile: false }))
      .toEqual({ domicilio: 4000, flete: 0, total: 4000 });
  });

  it('a otra ciudad y recoge en taquilla: SOLO el flete', () => {
    // El defecto que esto corrige: se cobraban los dos, y en un envío a otra
    // ciudad nadie hace un domicilio urbano — el comercio lleva la caja a la
    // terminal y el cliente la recoge. Era cobrar un servicio inexistente.
    expect(desgloseEnvio({ deliveryFee: 4000, intercityFee: 18000, intercity: true, lastMile: false }))
      .toEqual({ domicilio: 0, flete: 18000, total: 18000 });
  });

  it('a otra ciudad y hasta la puerta: flete + domicilio', () => {
    // Aquí el domicilio sí paga a alguien: al repartidor de DESTINO.
    expect(desgloseEnvio({ deliveryFee: 4000, intercityFee: 18000, intercity: true, lastMile: true }))
      .toEqual({ domicilio: 4000, flete: 18000, total: 22000 });
  });

  it('un pedido local no cobra flete aunque venga un valor suelto', () => {
    expect(desgloseEnvio({ deliveryFee: 4000, intercityFee: 18000, intercity: false, lastMile: true }).flete)
      .toBe(0);
  });

  it('nada de importes negativos ni céntimos fantasma', () => {
    expect(desgloseEnvio({ deliveryFee: -500, intercityFee: -9, intercity: true, lastMile: true }))
      .toEqual({ domicilio: 0, flete: 0, total: 0 });
    expect(desgloseEnvio({ deliveryFee: 3999.6, intercityFee: 17999.4, intercity: true, lastMile: true }))
      .toEqual({ domicilio: 4000, flete: 17999, total: 21999 });
  });

  it('el flete ausente es cero, no revienta', () => {
    expect(desgloseEnvio({ deliveryFee: 4000, intercityFee: null, intercity: true, lastMile: false }))
      .toEqual({ domicilio: 0, flete: 0, total: 0 });
  });
});

describe('si se puede llevar a la puerta', () => {
  it('con coordenadas de entrega, sí', () => {
    expect(motivoParaNoLlevarAPuerta({ intercity: true, deliveryLat: 7.1, deliveryLng: -73.1 }))
      .toBeNull();
  });

  it('sin coordenadas, no: el despacho es PostGIS sobre un radio', () => {
    // Aceptarlo dejaría la caja en la bodega esperando a un repartidor que
    // nunca se busca, con el cliente creyendo que va en camino.
    expect(motivoParaNoLlevarAPuerta({ intercity: true, deliveryLat: null, deliveryLng: -73.1 }))
      .toBe('sin-coordenadas-de-entrega');
    expect(motivoParaNoLlevarAPuerta({ intercity: true, deliveryLat: 7.1, deliveryLng: undefined }))
      .toBe('sin-coordenadas-de-entrega');
  });

  it('un pedido local no tiene última milla que ofrecer', () => {
    expect(motivoParaNoLlevarAPuerta({ intercity: false, deliveryLat: 7.1, deliveryLng: -73.1 }))
      .toBe('no-es-intermunicipal');
  });
});

describe('dónde quedó la caja en destino', () => {
  it('la posición real del conductor que firmó el acta', () => {
    expect(puntoDeEntrega(7.1193, -73.1227)).toEqual({ lat: 7.1193, lng: -73.1227 });
  });

  it('sin posición no hay punto: no se manda al repartidor a adivinar', () => {
    // Mandarlo al centroide del municipio sería mandarlo a un sitio donde la
    // caja no está.
    expect(puntoDeEntrega(null, -73.1)).toBeNull();
    expect(puntoDeEntrega(undefined, undefined)).toBeNull();
    expect(puntoDeEntrega(Number.NaN, -73.1)).toBeNull();
  });

  it('(0,0) es «falta el dato», no el golfo de Guinea', () => {
    expect(puntoDeEntrega(0, 0)).toBeNull();
  });
});
