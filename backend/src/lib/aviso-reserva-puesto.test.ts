import { describe, it, expect } from 'vitest';
import { cuerpoDeNuevaReserva, TITULO_NUEVA_RESERVA } from './aviso-reserva-puesto';

describe('cuerpoDeNuevaReserva', () => {
  it('dice quién, cuántos y el acumulado', () => {
    expect(cuerpoDeNuevaReserva({ pasajero: 'María Torres', puestos: 2, vendidos: 2, total: 14 }))
      .toBe('María Torres apartó 2 puestos · 2 de 14 vendidos');
  });

  it('el acumulado es lo que hace útil el quinto aviso de un bus', () => {
    // En una van con tres reservas al día cada aviso vale solo; en un bus
    // de cuarenta llegan muchos seguidos y sin el «N de M» el quinto no
    // añade nada sobre el cuarto.
    const quinto = cuerpoDeNuevaReserva({ pasajero: 'Luis', puestos: 1, vendidos: 17, total: 40 });
    expect(quinto).toContain('17 de 40');
  });

  it('un puesto va en singular', () => {
    expect(cuerpoDeNuevaReserva({ pasajero: 'Ana', puestos: 1, vendidos: 1, total: 12 }))
      .toBe('Ana apartó 1 puesto · 1 de 12 vendidos');
  });

  it('sin total conocido NO inventa una fracción', () => {
    // «2 de 0» se lee como un fallo, y un aviso que parece roto se deja de
    // mirar — que es volver al problema de origen.
    expect(cuerpoDeNuevaReserva({ pasajero: 'Ana', puestos: 2, vendidos: 2, total: 0 }))
      .toBe('Ana apartó 2 puestos');
  });

  it('el acumulado nunca se pasa del total ni baja de lo comprado', () => {
    // Las dos cosas se leen como un error de cuentas y hacen dudar del
    // resto del aviso.
    expect(cuerpoDeNuevaReserva({ pasajero: 'Ana', puestos: 2, vendidos: 99, total: 12 }))
      .toContain('12 de 12');
    expect(cuerpoDeNuevaReserva({ pasajero: 'Ana', puestos: 3, vendidos: 0, total: 12 }))
      .toContain('3 de 12');
  });

  it('sin nombre no se deja un hueco', () => {
    expect(cuerpoDeNuevaReserva({ pasajero: '  ', puestos: 1, vendidos: 1, total: 8 }))
      .toBe('Un pasajero apartó 1 puesto · 1 de 8 vendidos');
  });

  it('el título es corto: la barra de notificaciones lo corta', () => {
    expect(TITULO_NUEVA_RESERVA.length).toBeLessThanOrEqual(40);
  });
});
