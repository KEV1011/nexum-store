import { describe, it, expect } from 'vitest';
import {
  saneaDestinos,
  destinosDesdeBD,
  destinoPara,
  esEnvioAOtraCiudad,
  TOPE_ENVIO_COP,
  TOPE_ETA_HORAS,
  MAX_DESTINOS,
} from './destinos-envio';

describe('declarar destinos de envío', () => {
  it('normaliza ciudad, precio y tiempo', () => {
    expect(
      saneaDestinos(
        [{ city: ' Bucaramanga ', fee: 15000.4, etaHours: 24 }],
        'cucuta',
      ),
    ).toEqual([{ city: 'bucaramanga', fee: 15000, etaHours: 24 }]);
  });

  it('sin destinos declarados la lista es vacía, no «a todas»', () => {
    // Es la regla que impide que al desplegar esto los restaurantes de
    // Pamplona empiecen a ofrecer almuerzos a Bogotá.
    expect(saneaDestinos(null, 'pamplona')).toEqual([]);
    expect(saneaDestinos([], 'pamplona')).toEqual([]);
  });

  it('rechaza declararse a sí mismo como destino', () => {
    // El error más caro: le cobraría flete intermunicipal a un cliente de la
    // misma cuadra.
    expect(() =>
      saneaDestinos([{ city: 'cucuta', fee: 12000, etaHours: 24 }], 'cucuta'),
    ).toThrow(/tu propia ciudad/i);
  });

  it('rechaza la ciudad repetida en vez de quedarse con una', () => {
    expect(() =>
      saneaDestinos(
        [
          { city: 'bogota', fee: 20000, etaHours: 24 },
          { city: 'bogota', fee: 35000, etaHours: 48 },
        ],
        'cucuta',
      ),
    ).toThrow(/repetida/i);
  });

  it('rechaza el precio con un cero de más, diciendo el tope', () => {
    const err = () =>
      saneaDestinos(
        [{ city: 'bogota', fee: TOPE_ENVIO_COP + 1, etaHours: 24 }],
        'cucuta',
      );
    expect(err).toThrow(new RegExp(String(TOPE_ENVIO_COP)));
    expect(err).toThrow(/cero/i);
  });

  it('rechaza precio cero o negativo', () => {
    expect(() => saneaDestinos([{ city: 'bogota', fee: 0, etaHours: 24 }], 'cucuta'))
      .toThrow(/mayor a cero/i);
    expect(() => saneaDestinos([{ city: 'bogota', fee: -1, etaHours: 24 }], 'cucuta'))
      .toThrow(/mayor a cero/i);
  });

  it('el tiempo prometido va entre una hora y una semana', () => {
    expect(() => saneaDestinos([{ city: 'bogota', fee: 1000, etaHours: 0 }], 'cucuta'))
      .toThrow(/al menos 1 hora/i);
    expect(() =>
      saneaDestinos(
        [{ city: 'bogota', fee: 1000, etaHours: TOPE_ETA_HORAS + 1 }],
        'cucuta',
      ),
    ).toThrow(new RegExp(String(TOPE_ETA_HORAS)));
  });

  it('rechaza un municipio con formato imposible', () => {
    expect(() =>
      saneaDestinos([{ city: 'San José!!', fee: 1000, etaHours: 24 }], 'cucuta'),
    ).toThrow(/no es un municipio válido/i);
  });

  it('acepta slugs con guion', () => {
    expect(
      saneaDestinos([{ city: 'villa-del-rosario', fee: 8000, etaHours: 12 }], 'cucuta'),
    ).toHaveLength(1);
  });

  it('pone tope a cuántos destinos se declaran', () => {
    const muchos = Array.from({ length: MAX_DESTINOS + 1 }, (_, i) => ({
      city: `municipio-${i}`,
      fee: 1000,
      etaHours: 24,
    }));
    expect(() => saneaDestinos(muchos, 'cucuta')).toThrow(new RegExp(String(MAX_DESTINOS)));
  });

  it('sin ciudad de origen conocida todavía valida lo demás', () => {
    // Un comercio cuya dirección no resolvió a ninguna plaza puede declarar
    // destinos igual; lo único que no se puede comprobar es el auto-destino.
    expect(saneaDestinos([{ city: 'bogota', fee: 1000, etaHours: 24 }], null))
      .toHaveLength(1);
  });
});

describe('leer lo guardado', () => {
  it('descarta lo corrupto en vez de tumbar la vitrina', () => {
    // Al leer se es tolerante a propósito: una fila mala de un comercio no
    // puede dejar su tienda sin pintar.
    expect(
      destinosDesdeBD([
        { city: 'bogota', fee: 20000, etaHours: 24 },
        null,
        'basura',
        { city: '', fee: 1, etaHours: 1 },
        { city: 'cali', fee: 0, etaHours: 24 },
        { city: 'cali', fee: 5000, etaHours: 0 },
        { city: 'bogota', fee: 99999, etaHours: 48 },
      ]),
    ).toEqual([{ city: 'bogota', fee: 20000, etaHours: 24 }]);
  });

  it('lo que no es lista se lee como lista vacía', () => {
    expect(destinosDesdeBD(null)).toEqual([]);
    expect(destinosDesdeBD({ city: 'bogota' })).toEqual([]);
  });
});

describe('cobrar el envío', () => {
  const destinos = [
    { city: 'bucaramanga', fee: 15000, etaHours: 24 },
    { city: 'bogota', fee: 28000, etaHours: 48 },
  ];

  it('encuentra el destino declarado', () => {
    expect(destinoPara(destinos, 'bogota')?.fee).toBe(28000);
    expect(destinoPara(destinos, 'BOGOTA')?.fee).toBe(28000);
  });

  it('a una ciudad no declarada no despacha', () => {
    expect(destinoPara(destinos, 'medellin')).toBeNull();
  });

  it('sin ciudad de destino NO cobra envío', () => {
    // La regla del repo: un dato que falta no puede convertir un pedido en
    // intermunicipal y cobrarle de más al cliente. Sin plaza resuelta, local.
    expect(destinoPara(destinos, null)).toBeNull();
    expect(destinoPara(destinos, '')).toBeNull();
  });
});

describe('si el pedido cruza de plaza', () => {
  it('dos plazas distintas sí', () => {
    expect(esEnvioAOtraCiudad('cucuta', 'bogota')).toBe(true);
  });

  it('la misma plaza no', () => {
    expect(esEnvioAOtraCiudad('cucuta', 'cucuta')).toBe(false);
    expect(esEnvioAOtraCiudad('Cucuta', 'cucuta')).toBe(false);
  });

  it('lo desconocido se trata como local', () => {
    // Exactamente el comportamiento que había antes de que existieran estas
    // columnas.
    expect(esEnvioAOtraCiudad(null, 'bogota')).toBe(false);
    expect(esEnvioAOtraCiudad('cucuta', null)).toBe(false);
    expect(esEnvioAOtraCiudad(null, null)).toBe(false);
  });
});
