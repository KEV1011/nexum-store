import { describe, it, expect } from 'vitest';

import { serviciosQuePuedeTomar, cuandoEnTexto } from './reservas.service';
import { guardaNoOcupa, guardaNoTerminal } from '../lib/estado-terminal';

// Las reglas del tablero de reservas que se pueden comprobar sin base de datos.
// Las que sí la necesitan —la toma atómica, el tope y los dos barridos— van en
// el E2E contra PostgreSQL real; aquí están las que deciden QUÉ se le enseña a
// cada conductor y qué cuenta como trabajo en curso.

describe('a quién le toca cada reserva', () => {
  it('el taxi solo ve reservas de taxi (y envíos, que no tienen categoría)', () => {
    const s = serviciosQuePuedeTomar('TAXI');
    expect(s).toContain('TAXI');
    expect(s).toContain('ENVIOS');
    // Esta es la que importa: si el tablero se listara con otro criterio que el
    // despacho, el taxista vería un viaje pedido como particular y al apartarlo
    // le estaría dando al pasajero algo distinto de lo que eligió y pagó.
    expect(s).not.toContain('PARTICULAR');
    expect(s).not.toContain('MOTO');
  });

  it('la moto no ve carreras de carro', () => {
    const s = serviciosQuePuedeTomar('MOTO');
    expect(s).toContain('MOTO');
    expect(s).not.toContain('TAXI');
    expect(s).not.toContain('PARTICULAR');
  });

  it('el particular no ve carreras de taxi', () => {
    // La tarifa del taxi la fija el decreto municipal; darle esa carrera a un
    // particular es cobrar una tarifa regulada sin serlo.
    expect(serviciosQuePuedeTomar('PARTICULAR')).not.toContain('TAXI');
  });

  it('sin vehículo activo no se le enseña nada', () => {
    // Un conductor sin vehículo registrado no puede cumplir ninguna reserva.
    // Enseñarle el tablero sería invitarle a apartar lo que no puede atender.
    expect(serviciosQuePuedeTomar(null)).toEqual([]);
  });

  it('un tipo de vehículo desconocido tampoco abre la puerta a las categorías', () => {
    // Un camión no recoge estudiantes. Si algún día entra un tipo nuevo en el
    // enum, el tablero no debe empezar a ofrecerle carreras urbanas solo. Los
    // envíos sí: ahí no hay categoría que prometer, igual que en el despacho.
    const s = serviciosQuePuedeTomar('MULA');
    expect(s).toEqual(['ENVIOS']);
  });
});

describe('una reserva para mañana no ocupa al conductor hoy', () => {
  it('SCHEDULED queda fuera de lo que cuenta como servicio en curso', () => {
    // Es el fallo silencioso que esto evita: con `guardaNoTerminal`, terminar
    // la carrera de hoy dejaba al conductor ON_TRIP —o sea, fuera del
    // despacho— mientras tuviera cualquier reserva apartada en la agenda.
    expect(guardaNoOcupa('trip').notIn).toContain('SCHEDULED');
    expect(guardaNoTerminal('trip').notIn).not.toContain('SCHEDULED');
  });

  it('sigue contando lo que de verdad está en curso', () => {
    const notIn = guardaNoOcupa('trip').notIn;
    expect(notIn).toContain('COMPLETED');
    expect(notIn).toContain('CANCELLED');
    // Un viaje aceptado o en curso SÍ lo ocupa: no puede quedar fuera de la
    // lista de exclusión o `liberarConductorSiNoTieneMas` lo pondría ONLINE
    // con un pasajero a bordo y le llegaría otro servicio.
    expect(notIn).not.toContain('ACCEPTED');
    expect(notIn).not.toContain('IN_PROGRESS');
  });

  it('pedidos y mandados no se programan: para ellos no cambia nada', () => {
    expect(guardaNoOcupa('order').notIn).toEqual(guardaNoTerminal('order').notIn);
    expect(guardaNoOcupa('errand').notIn).toEqual(guardaNoTerminal('errand').notIn);
  });
});

describe('la hora que se le dice al pasajero', () => {
  it('va en hora de Colombia, no en la del servidor', () => {
    // 11:00 UTC son las 06:00 en Bogotá. El servidor de Render corre en UTC, y
    // sin la zona el push diría «te recoge a las 11:00» para un viaje de las 6.
    const texto = cuandoEnTexto(new Date('2026-09-21T11:00:00Z'));
    expect(texto).toContain('06:00');
    expect(texto).not.toContain('11:00');
  });

  it('sin fecha no se inventa una hora', () => {
    expect(cuandoEnTexto(null)).toBe('a la hora acordada');
  });
});
