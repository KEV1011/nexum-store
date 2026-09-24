import { describe, it, expect } from 'vitest';
import {
  admiteDomicilio,
  modoDeAbordaje,
  elegirAbordaje,
  PUNTO_DOMICILIO,
} from './recogida-salida';

describe('quién recoge en la casa', () => {
  it('la VAN sí: es su forma de operar y por lo que se elige', () => {
    expect(admiteDomicilio('VAN')).toBe(true);
  });

  it('la buseta y el bus no: salen de la terminal', () => {
    // Ofrecerlo sería una promesa que el conductor tendría que desmentir por
    // teléfono, con el pasajero esperando en su portal.
    expect(admiteDomicilio('BUSETA')).toBe(false);
    expect(admiteDomicilio('BUS')).toBe(false);
  });

  it('sin vehículo declarado, sí: es como funcionan hoy todas las salidas', () => {
    // El carro particular del gasto compartido ya pregunta «dónde te recogen».
    // Un default en false les quitaría algo que ya tienen.
    expect(admiteDomicilio(null)).toBe(true);
    expect(admiteDomicilio(undefined)).toBe(true);
  });

  it('lo que declare la empresa MANDA sobre el vehículo', () => {
    // Hay buses que sí recogen en ruta y vans que solo paran en la terminal.
    // El valor por defecto es una deducción, no una regla.
    expect(admiteDomicilio('BUS', true)).toBe(true);
    expect(admiteDomicilio('VAN', false)).toBe(false);
  });
});

describe('qué se le ofrece al pasajero', () => {
  it('con puntos y domicilio, las dos cosas', () => {
    // Es el caso de la van que tiene parada fija en la terminal y además pasa
    // por las casas: obligar a elegir uno solo quitaría media operación.
    expect(modoDeAbordaje(true, true)).toBe('ambos');
  });

  it('solo puntos, o solo domicilio', () => {
    expect(modoDeAbordaje(true, false)).toBe('puntos');
    expect(modoDeAbordaje(false, true)).toBe('domicilio');
  });

  it('sin puntos y sin domicilio, se sube donde arranca', () => {
    // No se le deja un formulario vacío: se le dice dónde subir.
    expect(modoDeAbordaje(false, false)).toBe('solo_origen');
  });
});

describe('qué se sella en la reserva', () => {
  const puntos = [{ id: 'terminal' }, { id: 'parque' }];

  it('pidió domicilio: va la dirección y NINGÚN punto', () => {
    // El fallo que esto evita: mandar «sin punto» se confundía con lo que
    // manda una app vieja, y a quien pedía que lo recogieran en su casa se le
    // sellaba «Terminal» en la reserva.
    const r = elegirAbordaje({
      puntos, domicilioAdmitido: true,
      puntoId: PUNTO_DOMICILIO, direccion: 'Calle 5 # 3-40',
    });
    expect(r.punto).toBeNull();
    expect(r.direccion).toBe('Calle 5 # 3-40');
  });

  it('domicilio sin dirección se rechaza: el conductor no sabría a dónde ir', () => {
    const r = elegirAbordaje({
      puntos, domicilioAdmitido: true, puntoId: PUNTO_DOMICILIO, direccion: '  ',
    });
    expect(r.motivo).toMatch(/dónde te recogemos/i);
  });

  it('domicilio en una salida que no lo hace se rechaza', () => {
    const r = elegirAbordaje({
      puntos, domicilioAdmitido: false, puntoId: PUNTO_DOMICILIO, direccion: 'Calle 5',
    });
    expect(r.motivo).toMatch(/no recoge/i);
  });

  it('eligió un punto: ese, y la dirección sobra', () => {
    const r = elegirAbordaje({
      puntos, domicilioAdmitido: true, puntoId: 'parque', direccion: 'Calle 5',
    });
    expect(r.punto?.id).toBe('parque');
    expect(r.direccion).toBeNull();
  });

  it('un punto que ya no existe se rechaza, no cae al primero', () => {
    const r = elegirAbordaje({ puntos, domicilioAdmitido: true, puntoId: 'inventado' });
    expect(r.motivo).toMatch(/ya no existe/i);
  });

  it('app vieja con dirección escrita: se entiende como domicilio', () => {
    const r = elegirAbordaje({ puntos, domicilioAdmitido: true, direccion: 'Mi casa' });
    expect(r.punto).toBeNull();
    expect(r.direccion).toBe('Mi casa');
  });

  it('app vieja sin nada: la terminal', () => {
    const r = elegirAbordaje({ puntos, domicilioAdmitido: true });
    expect(r.punto?.id).toBe('terminal');
  });

  it('salida sin puntos: se conserva la dirección de siempre', () => {
    const r = elegirAbordaje({ puntos: [], domicilioAdmitido: true, direccion: 'Mi casa' });
    expect(r.punto).toBeNull();
    expect(r.direccion).toBe('Mi casa');
  });
});
