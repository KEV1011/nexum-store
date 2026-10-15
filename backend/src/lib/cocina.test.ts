import { describe, it, expect } from 'vitest';
import {
  ESTADOS_EN_COCINA,
  columnaDeCocina,
  minutosEnCocina,
  estaDemorado,
  ordenarParaCocina,
  platosPendientes,
  destinoDeCocina,
  type PedidoCocina,
} from './cocina';

const AHORA = new Date('2026-10-13T19:00:00Z');
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60000);

function pedido(p: Partial<PedidoCocina> = {}): PedidoCocina {
  return {
    id: 'o1',
    orderRef: 'ZP-1',
    status: 'PREPARING',
    mode: 'DELIVERY',
    tableLabel: null,
    acceptedAt: haceMin(5),
    readyAt: null,
    etaMinutes: null,
    lineas: [{ productName: 'Hamburguesa', quantity: 1, optionsSummary: null, notes: null }],
    ...p,
  };
}

describe('la pantalla de la cocina', () => {
  describe('qué pedidos entran', () => {
    it('no entra lo que el negocio todavía no aceptó', () => {
      // En PENDING el dueño aún puede rechazarlo por existencias. Cocinar ahí
      // es hacer platos que nadie confirmó.
      expect(ESTADOS_EN_COCINA).not.toContain('PENDING');
    });

    it('sigue a la vista mientras el repartidor va o llega', () => {
      // Si desapareciera al marcarlo listo, el cocinero no podría comprobar
      // qué entregó y acabaría repitiendo el plato.
      expect(ESTADOS_EN_COCINA).toContain('DRIVER_TO_PICKUP');
      expect(ESTADOS_EN_COCINA).toContain('AT_PICKUP');
    });

    it('sale del tablero cuando ya va en camino o se sirvió', () => {
      for (const fuera of ['IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'AT_DESTINATION_HUB']) {
        expect(ESTADOS_EN_COCINA).not.toContain(fuera);
      }
    });
  });

  describe('el reloj', () => {
    it('cuenta desde que la cocina pudo empezar', () => {
      expect(minutosEnCocina(pedido({ acceptedAt: haceMin(12) }), AHORA)).toBe(12);
    });

    it('se congela al marcarlo listo', () => {
      // De un plato hecho interesa cuánto TARDÓ, no cuánto lleva esperando a
      // que lo recojan.
      const p = pedido({ acceptedAt: haceMin(30), readyAt: haceMin(20) });
      expect(minutosEnCocina(p, AHORA)).toBe(10);
    });

    it('sin el dato devuelve null, no cero', () => {
      // Un cero se lee como «acaba de entrar», que es una afirmación; aquí no
      // se sabe nada.
      expect(minutosEnCocina(pedido({ acceptedAt: null }), AHORA)).toBeNull();
    });

    it('un reloj al revés no inventa un número', () => {
      const p = pedido({ acceptedAt: AHORA, readyAt: haceMin(5) });
      expect(minutosEnCocina(p, AHORA)).toBeNull();
    });
  });

  describe('la demora', () => {
    it('sin tiempo declarado NUNCA marca demora', () => {
      // Inventar un umbral acusaría a la cocina de incumplir algo que nadie
      // pactó, y en un asadero saldría todo en rojo desde el primer día.
      const p = pedido({ acceptedAt: haceMin(90), etaMinutes: null });
      expect(estaDemorado(p, AHORA)).toBe(false);
    });

    it('con tiempo declarado marca al pasarse', () => {
      expect(estaDemorado(pedido({ acceptedAt: haceMin(25), etaMinutes: 20 }), AHORA)).toBe(true);
      expect(estaDemorado(pedido({ acceptedAt: haceMin(15), etaMinutes: 20 }), AHORA)).toBe(false);
    });

    it('justo en el tiempo todavía no es tarde', () => {
      expect(estaDemorado(pedido({ acceptedAt: haceMin(20), etaMinutes: 20 }), AHORA)).toBe(false);
    });

    it('un plato ya listo a tiempo no queda marcado como tarde', () => {
      const p = pedido({ acceptedAt: haceMin(60), readyAt: haceMin(45), etaMinutes: 20 });
      expect(estaDemorado(p, AHORA)).toBe(false);
    });

    it('un eta de cero o negativo se ignora en vez de marcarlo todo', () => {
      expect(estaDemorado(pedido({ acceptedAt: haceMin(90), etaMinutes: 0 }), AHORA)).toBe(false);
    });
  });

  describe('las columnas', () => {
    it('sin marca de listo va a la plancha', () => {
      expect(columnaDeCocina({ readyAt: null })).toBe('en_cocina');
    });

    it('con marca va a listos', () => {
      expect(columnaDeCocina({ readyAt: haceMin(1) })).toBe('listo');
    });
  });

  describe('el orden', () => {
    it('el que lleva más esperando va primero', () => {
      const orden = ordenarParaCocina([
        pedido({ id: 'nuevo', acceptedAt: haceMin(2) }),
        pedido({ id: 'viejo', acceptedAt: haceMin(40) }),
        pedido({ id: 'medio', acceptedAt: haceMin(15) }),
      ], AHORA);
      expect(orden.map((p) => p.id)).toEqual(['viejo', 'medio', 'nuevo']);
    });

    it('los que no tienen reloj van al final', () => {
      // De esos no se puede afirmar que lleven esperando, así que no pueden
      // colarse delante de uno que sí lleva media hora.
      const orden = ordenarParaCocina([
        pedido({ id: 'sinreloj', acceptedAt: null }),
        pedido({ id: 'conreloj', acceptedAt: haceMin(3) }),
      ], AHORA);
      expect(orden.map((p) => p.id)).toEqual(['conreloj', 'sinreloj']);
    });

    it('no modifica la lista que recibe', () => {
      const lista = [pedido({ id: 'a', acceptedAt: haceMin(1) }),
                     pedido({ id: 'b', acceptedAt: haceMin(9) })];
      ordenarParaCocina(lista, AHORA);
      expect(lista.map((p) => p.id)).toEqual(['a', 'b']);
    });
  });

  describe('la carga', () => {
    it('cuenta PLATOS, no pedidos', () => {
      // «3 pedidos» y «11 platos» son cosas muy distintas para quien cocina.
      const carga = platosPendientes([
        pedido({ lineas: [{ productName: 'A', quantity: 4, optionsSummary: null, notes: null }] }),
        pedido({ lineas: [
          { productName: 'B', quantity: 2, optionsSummary: null, notes: null },
          { productName: 'C', quantity: 5, optionsSummary: null, notes: null },
        ] }),
      ]);
      expect(carga).toBe(11);
    });

    it('lo ya listo no cuenta como pendiente', () => {
      const carga = platosPendientes([
        pedido({ readyAt: haceMin(1),
                 lineas: [{ productName: 'A', quantity: 9, optionsSummary: null, notes: null }] }),
        pedido({ lineas: [{ productName: 'B', quantity: 2, optionsSummary: null, notes: null }] }),
      ]);
      expect(carga).toBe(2);
    });
  });

  describe('el destino', () => {
    it('dice la mesa cuando la hay', () => {
      expect(destinoDeCocina({ mode: 'DINE_IN', tableLabel: 'Terraza 2' })).toBe('Mesa Terraza 2');
    });

    it('sin mesa sellada no se inventa un número', () => {
      // Llevar un plato a la mesa equivocada es peor que preguntar.
      expect(destinoDeCocina({ mode: 'DINE_IN', tableLabel: null })).toBe('En el local');
    });

    it('el domicilio se nombra como lo que es', () => {
      expect(destinoDeCocina({ mode: 'DELIVERY', tableLabel: null })).toBe('Domicilio');
    });
  });
});

describe('el destino en la cocina, con «para llevar»', () => {
  it('lo nombra por lo que es', () => {
    // Con el `else 'Domicilio'` de antes, un pedido PARA LLEVAR salía
    // marcado como domicilio y el cocinero lo dejaba para el repartidor
    // mientras el cliente esperaba de pie en el mostrador.
    expect(destinoDeCocina({ mode: 'TAKEAWAY', tableLabel: null })).toBe('Para llevar');
  });
});
