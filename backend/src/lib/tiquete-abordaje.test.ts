import { describe, it, expect } from 'vitest';
import {
  generarCodigoTiquete, normalizarCodigo, motivoParaNoAbordar, codigoLegible,
} from './tiquete-abordaje';

describe('el código del tiquete', () => {
  it('nunca trae caracteres que se confundan al dictarlo', () => {
    // Esta es LA regla del formato. Un pasajero dicta su código por teléfono
    // y un conductor lo teclea con una mano: cada 0/O o 1/I/L es una
    // discusión en la puerta del bus con el motor andando.
    const prohibidos = /[01ILO]/;
    for (let i = 0; i < 300; i++) {
      expect(generarCodigoTiquete()).not.toMatch(prohibidos);
    }
  });

  it('mide siempre lo mismo', () => {
    for (let i = 0; i < 50; i++) {
      expect(generarCodigoTiquete()).toHaveLength(6);
    }
  });

  it('un aleatorio que devuelva 1 no produce un código roto', () => {
    // Sin el clamp saldría `undefined` dentro de la cadena y el tiquete
    // sería inservible sin que nada avisara.
    const codigo = generarCodigoTiquete(() => 1);
    expect(codigo).toHaveLength(6);
    expect(codigo).not.toContain('undefined');
  });

  it('se dicta en dos bloques de tres', () => {
    expect(codigoLegible('K7M3PQ')).toBe('K7M 3PQ');
    // Lo que no mide seis se devuelve tal cual en vez de partirlo mal.
    expect(codigoLegible('ABC')).toBe('ABC');
    expect(codigoLegible(null)).toBe('');
  });
});

describe('normalizar lo que teclean', () => {
  it('acepta espacios, guiones y minúsculas', () => {
    // Comparar sin normalizar rechazaría un tiquete válido, que es el peor
    // fallo de esta pantalla: el pasajero tiene razón y el sistema dice no.
    expect(normalizarCodigo('k7m 3pq')).toBe('K7M3PQ');
    expect(normalizarCodigo('K7M-3PQ')).toBe('K7M3PQ');
    expect(normalizarCodigo('  K7M3PQ  ')).toBe('K7M3PQ');
  });

  it('NO adivina un 0 por una O', () => {
    // El alfabeto excluye los dos, así que si aparecen es que alguien tecleó
    // otra cosa y no hay forma de saber cuál. Adivinarlo podría validar el
    // tiquete de otra persona.
    expect(normalizarCodigo('K0M3PQ')).toBe('K0M3PQ');
    expect(normalizarCodigo('KOM3PQ')).toBe('KOM3PQ');
  });

  it('con vacío o nulo devuelve vacío en vez de reventar', () => {
    expect(normalizarCodigo(null)).toBe('');
    expect(normalizarCodigo(undefined)).toBe('');
    expect(normalizarCodigo('---')).toBe('');
  });
});

describe('¿puede subir?', () => {
  const base = {
    codigo: 'K7M3PQ',
    pooledTripId: 'salida-1',
    estado: 'CONFIRMED',
    abordoEn: null as Date | null,
    puestos: 2,
  };

  it('con todo en orden, sube', () => {
    expect(motivoParaNoAbordar(base, 'salida-1').motivo).toBeNull();
  });

  it('un tiquete inexistente se rechaza sin más', () => {
    expect(motivoParaNoAbordar(null, 'salida-1').motivo).toContain('No encontramos');
  });

  it('LO PRIMERO que se mira es que sea de ESTA salida', () => {
    // Es el error que más se paga: el pasajero se sube tranquilo y aparece
    // en una ciudad equivocada. Por eso va antes que cualquier otra
    // comprobación, incluso que «ya abordó».
    const otro = { ...base, estado: 'CANCELLED', abordoEn: new Date() };
    expect(motivoParaNoAbordar(otro, 'salida-2').motivo).toBe('Ese tiquete es de otra salida.');
  });

  it('una reserva cancelada no da derecho a subir aunque el código exista', () => {
    const cancelada = { ...base, estado: 'CANCELLED' };
    expect(motivoParaNoAbordar(cancelada, 'salida-1').motivo).toContain('no está confirmada');
  });

  it('un tiquete ya usado se rechaza Y DICE A QUÉ HORA se usó', () => {
    // Esto es lo que convierte el tiquete en algo que vale: alguien
    // fotografió el de otro. La hora es lo que le permite al conductor
    // resolverlo ahí mismo en vez de discutir.
    const cuando = new Date('2026-10-05T06:12:00Z');
    const usado = { ...base, abordoEn: cuando };
    const v = motivoParaNoAbordar(usado, 'salida-1');
    expect(v.motivo).toContain('ya se usó');
    expect(v.abordoEn).toEqual(cuando);
  });
});
