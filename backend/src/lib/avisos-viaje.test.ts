import { describe, it, expect } from 'vitest';
import {
  avisoDeEstado,
  avisoSinConductor,
  avisoCancelacionAlConductor,
  type EstadoViaje,
} from './avisos-viaje';

describe('los avisos del viaje urbano', () => {
  it('«tu conductor llegó» existe — era el que faltaba', () => {
    // En un taxi es LA notificación: el carro está en la puerta. Sin ella, el
    // pasajero que cerró la app se entera cuando lo llaman por teléfono.
    const a = avisoDeEstado('arrived')!;
    expect(a.title).toMatch(/llegó/i);
    expect(a.type).toBe('trip_arrived');
  });

  it('el envío habla de paquete, no de pasajero', () => {
    expect(avisoDeEstado('arrived', { esEnvio: true })!.title).toMatch(/repartidor/i);
    expect(avisoDeEstado('completed', { esEnvio: true })!.title).toMatch(/entregado/i);
  });

  it('al completar dice el total', () => {
    // Es lo primero que quiere saber quien va a pagar en efectivo.
    expect(avisoDeEstado('completed', { finalFare: 12500 })!.body).toContain('$12.500');
  });

  it('sin tarifa no inventa un número', () => {
    const a = avisoDeEstado('completed', { finalFare: null })!;
    expect(a.body).not.toMatch(/\$/);
    expect(avisoDeEstado('completed', { finalFare: 0 })!.body).not.toMatch(/\$/);
  });

  it('CALLA en los estados que no lo merecen', () => {
    // Un push por cada cambio de estado enseña a silenciar la app, y entonces
    // se pierde también el aviso que sí importaba.
    const callados: EstadoViaje[] = ['searching', 'accepted', 'arriving', 'cancelled'];
    for (const e of callados) {
      expect(avisoDeEstado(e), `${e} no debería avisar`).toBeNull();
    }
  });

  it('«accepted» calla porque ya lo avisa el matching', () => {
    // Si aquí también avisara, al pasajero le sonaría dos veces por el mismo
    // hecho y parecería que le asignaron dos conductores.
    expect(avisoDeEstado('accepted')).toBeNull();
  });

  it('cada aviso trae su tipo, que es lo que enruta la app al tocarlo', () => {
    for (const e of ['arrived', 'in_progress', 'completed'] as EstadoViaje[]) {
      expect(avisoDeEstado(e)!.type).toMatch(/^trip_/);
    }
  });
});

describe('los otros dos avisos que faltaban', () => {
  it('sin conductor: dice que NO se cobró', () => {
    // El pasajero cerró la app buscando. Al volver encuentra el viaje
    // cancelado; si no se le dice que no se le cobró, lo primero que hace es
    // abrir un reclamo.
    const a = avisoSinConductor();
    expect(a.body).toMatch(/no se te cobró/i);
    expect(a.type).toBe('trip_no_driver');
  });

  it('cancelación al conductor: le dice que deje de ir', () => {
    // Iba conduciendo hacia una recogida que ya no existe. Sin este aviso
    // gasta gasolina y tiempo en un viaje cancelado.
    const a = avisoCancelacionAlConductor('Calle 5 #3-40');
    expect(a.body).toContain('Calle 5 #3-40');
    expect(a.body).toMatch(/disponible/i);
  });

  it('y funciona sin dirección', () => {
    expect(avisoCancelacionAlConductor(null).body).toMatch(/recogida/i);
  });
});
