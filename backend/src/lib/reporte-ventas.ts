// ── Lo que el negocio vendió en un período ───────────────────────────────────
//
// EL REPORTE: «hay clientes que buscan toda la facturación de lo que se pide».
// Lo que el portal tenía era el panel de HOY —pedidos, en curso, entregados y
// la venta del día— y nada más: no se podía cerrar una semana, ni un mes, ni
// saber qué producto es el que de verdad sostiene el negocio.
//
// ESTO NO ES UNA FACTURA, y el nombre importa. Una factura electrónica en
// Colombia la emite un facturador autorizado por la DIAN, con su resolución de
// numeración, su CUFE y su envío a la DIAN. Llamar «factura» a este documento
// le daría al dueño la idea de que ya está cumpliendo, y el que responde ante
// la DIAN es él, no nosotros. Esto es un REPORTE DE VENTAS: le dice cuánto
// vendió, de qué y cuándo, que es lo que hace falta para cuadrar la caja y para
// declarar — y es también lo que su contador le va a pedir.
//
// LA REGLA QUE MÁS IMPORTA: **lo del negocio es el subtotal menos el
// descuento, no el total.** El domicilio es el pago del repartidor y el flete
// intermunicipal es del transportador; la propina es del repartidor. Sumar
// `total` le prometería al dueño una plata que no es suya, y la descubriría al
// cuadrar la caja y encontrarse corto — que es la peor forma de descubrirlo.

import type { $Enums } from '@prisma/client';
import { metodoPorValor } from './metodos-pago';
import { HORAS_UTC_COLOMBIA } from './horario-tienda';

/**
 * Un pedido VENDIDO es uno entregado o servido.
 *
 * Lo cancelado no se cuenta —nadie lo pagó— y lo que está en curso tampoco,
 * porque todavía puede caerse. Es el MISMO criterio que el panel del día, y
 * vive aquí para que no haya dos: con dos, el reporte del mes y el panel de hoy
 * dirían cifras distintas del mismo pedido y nadie sabría cuál creer.
 */
export function esVendido(status: $Enums.OrderStatus | string): boolean {
  return status === 'DELIVERED';
}

export interface LineaDeReporte {
  nombre: string;
  quantity: number;
  /** El precio SELLADO en el pedido, no el del catálogo de hoy. */
  unitPrice: number;
}

export interface PedidoDeReporte {
  ref: string;
  fecha: Date;
  mode: string;
  status: $Enums.OrderStatus | string;
  subtotal: number;
  promoDiscount?: number | null;
  deliveryFee: number;
  intercityFee?: number | null;
  tipAmount?: number | null;
  paymentMethod?: string | null;
  lines: LineaDeReporte[];
}

export interface DiaDeVentas {
  /** `YYYY-MM-DD`, en hora de Colombia. */
  fecha: string;
  pedidos: number;
  tuyo: number;
}

export interface ProductoVendido {
  nombre: string;
  unidades: number;
  tuyo: number;
}

export interface MedioDeCobro {
  medio: string;
  etiqueta: string;
  /** `true` = la plataforma recaudó; `false` = lo cobró el negocio o el repartidor. */
  cobraLaPlataforma: boolean;
  pedidos: number;
  tuyo: number;
}

export interface ReporteVentas {
  pedidos: number;
  /** Lo del negocio: subtotal − descuento. */
  tuyo: number;
  /** Lo que se dejó de cobrar por promociones, que el negocio asumió. */
  descuentos: number;
  /** Del repartidor, no del negocio. Se muestra para que no lo cuente como suyo. */
  domicilios: number;
  /** Del transportador intermunicipal. Tampoco es del negocio. */
  fletes: number;
  /** Del repartidor. */
  propinas: number;
  /** En salón. */
  enMesa: number;
  /** Para llevar: se cobró en el mostrador y el cliente se lo llevó. */
  paraLlevar: number;
  /** A domicilio. */
  aDomicilio: number;
  /** `null` sin pedidos: un promedio sin denominador no es cero, es nada. */
  ticketPromedio: number | null;
  porDia: DiaDeVentas[];
  porProducto: ProductoVendido[];
  porMedio: MedioDeCobro[];
}

/**
 * El día colombiano de una fecha, `YYYY-MM-DD`.
 *
 * Colombia es UTC−5 todo el año. Agrupar por el día del SERVIDOR metería la
 * venta de las 9 de la noche en el día siguiente, y el dueño cuadraría su caja
 * contra un reporte que parte el día donde él ya cerró. El desfase sale de
 * `horario-tienda` y no de una constante de aquí: con dos copias, dos pantallas
 * acabarían cortando el día en momentos distintos.
 */
export function diaColombiano(fecha: Date): string {
  const t = new Date(fecha.getTime() + HORAS_UTC_COLOMBIA * 3_600_000);
  return t.toISOString().slice(0, 10);
}

/**
 * La ventana UTC que corresponde a unos días COLOMBIANOS.
 *
 * NO se usa `rangoFechas` aquí a propósito, y lo destapó el E2E: aquél
 * interpreta «2026-06-10» como medianoche UTC, que en Colombia son las 7 de la
 * tarde del día 9. Con eso pasaban las dos cosas: el reporte dibujaba un día
 * de más al principio, y —peor— la consulta cortaba el día a las 6:59 de la
 * tarde, así que la venta de la noche de un restaurante caía en el día
 * siguiente. La consulta y el agrupamiento tienen que partir el día en el MISMO
 * instante; si no, el total de arriba no cuadra con la suma de los días.
 *
 * `rangoFechas` se queda como está porque lo usan los reportes de las flotas,
 * donde el corte de 24 horas no es el de una caja de restaurante.
 */
export function ventanaColombiana(
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } {
  const dia = (v: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (!m) return null;
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return Number.isNaN(t) ? null : new Date(t);
  };
  const salida: { gte?: Date; lte?: Date } = {};
  const d = from ? dia(from) : null;
  const h = to ? dia(to) : null;
  // Medianoche en Colombia es 05:00 UTC del mismo día.
  if (d) salida.gte = new Date(d.getTime() - HORAS_UTC_COLOMBIA * 3_600_000);
  // El último día entra COMPLETO: hasta las 23:59:59.999 de Colombia, que son
  // las 04:59:59.999 UTC del día siguiente.
  if (h) salida.lte = new Date(h.getTime() - HORAS_UTC_COLOMBIA * 3_600_000 + 86_399_999);
  return salida;
}

/** Lo que el negocio se lleva de un pedido. */
export function loDelNegocio(p: PedidoDeReporte): number {
  return Math.max(0, p.subtotal - (p.promoDiscount ?? 0));
}

/**
 * El reporte de un período.
 *
 * `desde` y `hasta` sirven para DIBUJAR los días vacíos: agrupar en SQL solo
 * devuelve los días con pedidos, y pintar eso hace que una semana con dos días
 * muertos parezca entera. Un día en cero es información —ese martes no se
 * vendió nada—; que el día no aparezca es un hueco que nadie interpreta.
 */
export function reporteDeVentas(
  pedidos: PedidoDeReporte[],
  desde?: Date,
  hasta?: Date,
): ReporteVentas {
  const vendidos = pedidos.filter((p) => esVendido(p.status));

  let tuyo = 0;
  let descuentos = 0;
  let domicilios = 0;
  let fletes = 0;
  let propinas = 0;
  let enMesa = 0;
  let paraLlevar = 0;
  let aDomicilio = 0;

  const dias = new Map<string, DiaDeVentas>();
  const productos = new Map<string, ProductoVendido>();
  const medios = new Map<string, MedioDeCobro>();

  for (const p of vendidos) {
    const mio = loDelNegocio(p);
    tuyo += mio;
    descuentos += p.promoDiscount ?? 0;
    domicilios += p.deliveryFee ?? 0;
    fletes += p.intercityFee ?? 0;
    propinas += p.tipAmount ?? 0;
    // Tres cajones, no dos. Con `=== 'DINE_IN'` un pedido PARA LLEVAR caía
    // en «a domicilio», y el dueño vería domicilios que nunca salieron del
    // local — justo el número que mira para decidir si contrata repartidor.
    if (p.mode === 'DINE_IN') enMesa += 1;
    else if (p.mode === 'TAKEAWAY') paraLlevar += 1;
    else aDomicilio += 1;

    const dia = diaColombiano(p.fecha);
    const ya = dias.get(dia);
    if (ya) { ya.pedidos += 1; ya.tuyo += mio; }
    else dias.set(dia, { fecha: dia, pedidos: 1, tuyo: mio });

    for (const l of p.lines) {
      const clave = l.nombre.trim() || '(sin nombre)';
      const acum = productos.get(clave) ?? { nombre: clave, unidades: 0, tuyo: 0 };
      acum.unidades += l.quantity;
      acum.tuyo += l.quantity * l.unitPrice;
      productos.set(clave, acum);
    }

    const medio = (p.paymentMethod ?? '').trim() || 'sin_declarar';
    const acumM = medios.get(medio) ?? {
      medio,
      etiqueta: metodoPorValor(medio)?.etiqueta ?? 'Sin declarar',
      // Sin método declarado se asume que lo cobró el negocio o el repartidor:
      // darlo por recaudado por la plataforma diría que le debemos una plata
      // que nunca entró. Es el mismo criterio del saldo del conductor.
      cobraLaPlataforma: metodoPorValor(medio)?.quienCobra === 'plataforma',
      pedidos: 0,
      tuyo: 0,
    };
    acumM.pedidos += 1;
    acumM.tuyo += mio;
    medios.set(medio, acumM);
  }

  // Los días vacíos del rango, en cero.
  if (desde && hasta) {
    for (let t = new Date(desde.getTime()); t.getTime() <= hasta.getTime(); t = new Date(t.getTime() + 86_400_000)) {
      const d = diaColombiano(t);
      if (!dias.has(d)) dias.set(d, { fecha: d, pedidos: 0, tuyo: 0 });
    }
  }

  return {
    pedidos: vendidos.length,
    tuyo: Math.round(tuyo),
    descuentos: Math.round(descuentos),
    domicilios: Math.round(domicilios),
    fletes: Math.round(fletes),
    propinas: Math.round(propinas),
    enMesa,
    paraLlevar,
    aDomicilio,
    ticketPromedio: vendidos.length === 0 ? null : Math.round(tuyo / vendidos.length),
    porDia: [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porProducto: [...productos.values()]
      .map((p) => ({ ...p, tuyo: Math.round(p.tuyo) }))
      .sort((a, b) => b.tuyo - a.tuyo || a.nombre.localeCompare(b.nombre)),
    porMedio: [...medios.values()]
      .map((m) => ({ ...m, tuyo: Math.round(m.tuyo) }))
      .sort((a, b) => b.tuyo - a.tuyo),
  };
}

/**
 * El reporte en CSV, para abrirlo en Excel o mandárselo al contador.
 *
 * Separador `;` y coma decimal: con `,` el Excel en español apelotona todo en
 * la primera columna. Es la misma lección que el CSV de las métricas.
 */
export function reporteACsv(r: ReporteVentas): string {
  const n = (v: number) => String(v).replace('.', ',');
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out: string[] = [];

  out.push('REPORTE DE VENTAS (no es una factura electronica)');
  out.push('');
  out.push('Concepto;Valor');
  out.push(`Pedidos vendidos;${r.pedidos}`);
  out.push(`Tu venta (subtotal menos descuentos);${n(r.tuyo)}`);
  out.push(`Descuentos que asumiste;${n(r.descuentos)}`);
  out.push(`Domicilios (del repartidor, no tuyos);${n(r.domicilios)}`);
  out.push(`Fletes intermunicipales (del transportador);${n(r.fletes)}`);
  out.push(`Propinas (del repartidor);${n(r.propinas)}`);
  out.push(`Ticket promedio;${r.ticketPromedio == null ? '' : n(r.ticketPromedio)}`);
  out.push('');
  out.push('Dia;Pedidos;Tu venta');
  for (const d of r.porDia) out.push(`${d.fecha};${d.pedidos};${n(d.tuyo)}`);
  out.push('');
  out.push('Producto;Unidades;Tu venta');
  for (const p of r.porProducto) out.push(`${celda(p.nombre)};${p.unidades};${n(p.tuyo)}`);
  out.push('');
  out.push('Medio de pago;Quien cobro;Pedidos;Tu venta');
  for (const m of r.porMedio) {
    out.push(`${celda(m.etiqueta)};${m.cobraLaPlataforma ? 'ZIPA' : 'Tu negocio'};${m.pedidos};${n(m.tuyo)}`);
  }
  return out.join('\n');
}
