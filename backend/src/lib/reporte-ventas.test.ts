/**
 * El reporte de ventas del negocio.
 *
 * LA PRUEBA QUE JUSTIFICA EL FICHERO es la primera: **lo del negocio es el
 * subtotal menos el descuento, no el total.** Sumar `total` le prometería al
 * dueño el domicilio del repartidor, el flete del transportador y la propina, y
 * lo descubriría al cuadrar la caja y encontrarse corto — que es la peor forma
 * de descubrirlo, porque ya contó esa plata como suya.
 */
import { describe, it, expect } from 'vitest';
import {
  diaColombiano,
  esVendido,
  loDelNegocio,
  reporteACsv,
  reporteDeVentas,
  ventanaColombiana,
  type PedidoDeReporte,
} from './reporte-ventas';

function pedido(p: Partial<PedidoDeReporte> = {}): PedidoDeReporte {
  return {
    ref: 'P-1',
    // 15:00 UTC = 10:00 en Colombia.
    fecha: new Date('2026-06-15T15:00:00Z'),
    mode: 'DELIVERY',
    status: 'DELIVERED',
    subtotal: 30000,
    deliveryFee: 5000,
    tipAmount: 2000,
    paymentMethod: 'efectivo',
    lines: [{ nombre: 'Bandeja paisa', quantity: 1, unitPrice: 30000 }],
    ...p,
  };
}

describe('lo que es del negocio y lo que no', () => {
  it('el domicilio, el flete y la propina NO son del negocio', () => {
    const r = reporteDeVentas([pedido({
      subtotal: 30000, deliveryFee: 5000, intercityFee: 12000, tipAmount: 2000,
    })]);
    expect(r.tuyo).toBe(30000);
    expect(r.domicilios).toBe(5000);
    expect(r.fletes).toBe(12000);
    expect(r.propinas).toBe(2000);
  });

  it('el descuento que asumió se resta', () => {
    // Está SELLADO en el pedido: cambiar la promoción mañana no reescribe lo
    // que se vendió ayer.
    const r = reporteDeVentas([pedido({ subtotal: 30000, promoDiscount: 6000 })]);
    expect(r.tuyo).toBe(24000);
    expect(r.descuentos).toBe(6000);
  });

  it('nunca sale negativo', () => {
    expect(loDelNegocio(pedido({ subtotal: 10000, promoDiscount: 15000 }))).toBe(0);
  });
});

describe('qué pedidos cuentan', () => {
  it('solo los entregados o servidos', () => {
    expect(esVendido('DELIVERED')).toBe(true);
    expect(esVendido('CANCELLED')).toBe(false);
    expect(esVendido('IN_TRANSIT')).toBe(false);
    expect(esVendido('AT_DESTINATION_HUB')).toBe(false);
  });

  it('lo cancelado y lo que está en curso no suman', () => {
    // Nadie pagó lo cancelado, y lo que está en curso todavía puede caerse.
    const r = reporteDeVentas([
      pedido({ status: 'DELIVERED', subtotal: 10000 }),
      pedido({ status: 'CANCELLED', subtotal: 90000 }),
      pedido({ status: 'IN_TRANSIT', subtotal: 50000 }),
    ]);
    expect(r.pedidos).toBe(1);
    expect(r.tuyo).toBe(10000);
  });
});

describe('el promedio y los días', () => {
  it('sin pedidos el ticket promedio es null, no cero', () => {
    // Un «$0 de ticket promedio» se lee como que se vendió a cero. Sin
    // denominador no hay promedio.
    const r = reporteDeVentas([]);
    expect(r.ticketPromedio).toBeNull();
    expect(r.pedidos).toBe(0);
  });

  it('con pedidos, es lo del negocio entre los pedidos', () => {
    const r = reporteDeVentas([
      pedido({ subtotal: 10000 }),
      pedido({ subtotal: 20000 }),
    ]);
    expect(r.ticketPromedio).toBe(15000);
  });

  it('los días vacíos del rango SE DIBUJAN', () => {
    // Agrupar en SQL solo devuelve los días con pedidos: pintar eso hace que
    // una semana con dos días muertos parezca entera.
    const r = reporteDeVentas(
      [pedido({ fecha: new Date('2026-06-15T15:00:00Z') })],
      new Date('2026-06-14T05:00:00Z'),
      new Date('2026-06-17T04:59:59Z'),
    );
    expect(r.porDia.map((d) => d.fecha)).toEqual(['2026-06-14', '2026-06-15', '2026-06-16']);
    expect(r.porDia.find((d) => d.fecha === '2026-06-14')!.pedidos).toBe(0);
    expect(r.porDia.find((d) => d.fecha === '2026-06-15')!.pedidos).toBe(1);
  });

  it('el día es el COLOMBIANO, no el del servidor', () => {
    // A las 02:00 UTC del 16 aquí son las 21:00 del 15. Agrupar por el día del
    // servidor metería la venta de la noche en el día siguiente y el dueño
    // cuadraría su caja contra un reporte que parte el día donde él ya cerró.
    const r = reporteDeVentas([pedido({ fecha: new Date('2026-06-16T02:00:00Z') })]);
    expect(r.porDia[0]!.fecha).toBe('2026-06-15');
  });
});

describe('por producto y por medio de pago', () => {
  it('suma unidades con el precio SELLADO en el pedido', () => {
    // No el del catálogo de hoy: si el dueño subió el precio esta mañana, lo
    // vendido ayer se vendió al de ayer.
    const r = reporteDeVentas([
      pedido({ lines: [{ nombre: 'Gaseosa', quantity: 2, unitPrice: 3500 }] }),
      pedido({ lines: [{ nombre: 'Gaseosa', quantity: 1, unitPrice: 4000 }] }),
    ]);
    expect(r.porProducto[0]).toEqual({ nombre: 'Gaseosa', unidades: 3, tuyo: 11000 });
  });

  it('ordena por lo que más vende', () => {
    const r = reporteDeVentas([pedido({
      lines: [
        { nombre: 'Jugo', quantity: 1, unitPrice: 5000 },
        { nombre: 'Bandeja', quantity: 1, unitPrice: 25000 },
      ],
    })]);
    expect(r.porProducto.map((p) => p.nombre)).toEqual(['Bandeja', 'Jugo']);
  });

  it('dice QUIÉN cobró cada peso', () => {
    const r = reporteDeVentas([
      pedido({ paymentMethod: 'en_linea', subtotal: 20000 }),
      pedido({ paymentMethod: 'efectivo', subtotal: 10000 }),
    ]);
    const linea = r.porMedio.find((m) => m.medio === 'en_linea')!;
    expect(linea.cobraLaPlataforma).toBe(true);
    expect(r.porMedio.find((m) => m.medio === 'efectivo')!.cobraLaPlataforma).toBe(false);
  });

  it('sin método declarado NO se da por recaudado por la plataforma', () => {
    // Diría que le debemos una plata que nunca entró. Es el criterio del saldo
    // del conductor, donde el error barato es dejar una comisión sin cobrar y
    // el caro es acreditar plata que no se recibió.
    const r = reporteDeVentas([pedido({ paymentMethod: null })]);
    expect(r.porMedio[0]!.cobraLaPlataforma).toBe(false);
    expect(r.porMedio[0]!.etiqueta).toBe('Sin declarar');
  });

  it('separa salón de domicilio', () => {
    const r = reporteDeVentas([
      pedido({ mode: 'DINE_IN' }),
      pedido({ mode: 'DELIVERY' }),
      pedido({ mode: 'DELIVERY' }),
    ]);
    expect(r.enMesa).toBe(1);
    expect(r.aDomicilio).toBe(2);
  });
});

describe('el CSV', () => {
  const csv = reporteACsv(reporteDeVentas([pedido({
    lines: [{ nombre: 'Arroz; con pollo', quantity: 1, unitPrice: 30000 }],
  })]));

  it('NO se llama factura, y lo dice', () => {
    // Una factura electrónica la emite un facturador autorizado por la DIAN.
    // Llamar así a esto le haría creer al dueño que ya está cumpliendo, y el
    // que responde ante la DIAN es él.
    expect(csv).toContain('REPORTE DE VENTAS');
    expect(csv).toMatch(/no es una factura/i);
  });

  it('usa punto y coma: con coma, el Excel en español lo apelotona', () => {
    expect(csv).toContain('Concepto;Valor');
  });

  it('y escapa el nombre que lleva un punto y coma dentro', () => {
    expect(csv).toContain('"Arroz; con pollo"');
  });
});

describe('la ventana del período va en hora de Colombia', () => {
  // Lo destapó el E2E: con `rangoFechas`, «2026-06-10» es medianoche UTC —las 7
  // de la tarde del 9 aquí—, así que el reporte dibujaba un día de más al
  // principio y la consulta cortaba el día a las 6:59 p. m.: la venta de la
  // noche de un restaurante caía en el día siguiente.
  it('empieza a medianoche de Colombia, no a medianoche UTC', () => {
    const v = ventanaColombiana('2026-06-10', '2026-06-15');
    expect(v.gte!.toISOString()).toBe('2026-06-10T05:00:00.000Z');
  });

  it('y el último día entra COMPLETO, hasta las 23:59 de Colombia', () => {
    const v = ventanaColombiana('2026-06-10', '2026-06-15');
    expect(v.lte!.toISOString()).toBe('2026-06-16T04:59:59.999Z');
    // La venta de las 9 de la noche del 15 cae DENTRO.
    expect(new Date('2026-06-16T02:00:00Z').getTime()).toBeLessThan(v.lte!.getTime());
    expect(diaColombiano(new Date('2026-06-16T02:00:00Z'))).toBe('2026-06-15');
  });

  it('la consulta y el agrupamiento parten el día en el mismo instante', () => {
    // Si no, el total de arriba no cuadra con la suma de los días.
    const v = ventanaColombiana('2026-06-10', '2026-06-10');
    expect(diaColombiano(v.gte!)).toBe('2026-06-10');
    expect(diaColombiano(v.lte!)).toBe('2026-06-10');
  });

  it('sin fechas no hay ventana: el reporte es de todo', () => {
    expect(ventanaColombiana()).toEqual({});
    expect(ventanaColombiana('no es fecha', 'tampoco')).toEqual({});
  });
});
