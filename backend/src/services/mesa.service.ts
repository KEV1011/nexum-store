// ── Pedir desde la mesa del restaurante ──────────────────────────────────────
//
// POR QUÉ EXISTE. Dentro del local, la atención se cae en el mismo sitio
// siempre: el comensal espera a que alguien venga con la carta, espera a que
// vuelva a tomar el pedido, y el mesero camina a la cocina con un papel. Con un
// QR en la mesa, el comensal pide cuando quiera y la cocina lo recibe escrito,
// con las adiciones y la nota de «sin cebolla» tal como él las marcó.
//
// LO QUE **NO** ES: un pedido a domicilio con otro nombre. Un `DINE_IN` no se
// despacha a ningún repartidor, no cobra domicilio, no lleva dirección ni PIN de
// custodia y no exige cuenta. Cada una de esas cuatro cosas, dejada como está en
// el camino de domicilio, rompería algo distinto: mandaría una moto a un local
// donde el plato ya está servido, le cobraría al comensal un servicio que nadie
// prestó, le pediría una dirección estando sentado, y le exigiría instalar la
// app para almorzar.
//
// LA PLATA NO PASA POR AQUÍ. En la mesa se paga en el local, al mesero o en la
// caja, como siempre. Por eso un pedido en mesa **no liquida comisión**: cobrar
// una sobre plata que no recaudamos sería crear una deuda que hay que perseguir
// —la lección que ya costó el saldo de los conductores en efectivo—. Este canal
// existe para que el local nos busque; el ingreso son sus domicilios.

import { prisma } from '../lib/prisma';
import type { BusinessPublicDTO, ClientOrderSummaryDTO } from '../types';
import { codigoDeCarta, mesaDelCatalogo, saneaMesas } from '../lib/mesas';
import { resolverLineasDePedido, descontarInventario } from './order-lines.service';
import { avisarNegocioDePedidoNuevo, _guardarCalificacionDePedido } from './client.service';
import { saneaEstrellas, saneaComentario } from '../lib/reputacion';
import { nombreEstadoPedido } from '../lib/estado-pedido';

/** La carta pública de un local, tal como la abre el comensal desde el QR. */
export interface CartaPublicaDTO {
  business: BusinessPublicDTO;
  /** Las mesas del local. Vacía = todavía no hay servicio en mesa. */
  tables: string[];
}

/** Un pedido en mesa visto por el comensal. */
export interface PedidoEnMesaDTO {
  id: string;
  orderRef: string;
  tableLabel: string;
  businessName: string;
  status: string;
  subtotal: number;
  total: number;
  /** Minutos de preparación que fijó la cocina al aceptar. Ausente = aún no. */
  prepMinutes?: number;
  acceptedAt?: string;
  createdAt?: string;
  /** La estrella que ya dejó, si la dejó. Se puede corregir. */
  rating?: number | null;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    optionsSummary?: string;
    notes?: string;
  }>;
}

// ─── El código público y las mesas (portal del dueño) ─────────────────────────

/**
 * Devuelve el código público de la carta, creándolo la primera vez.
 *
 * Se crea perezosamente y no al registrar el negocio porque los comercios ya
 * registrados no lo tienen: generarlo aquí hace que el primer dueño que entre a
 * la pantalla de mesas lo tenga, sin necesidad de rellenar la tabla entera.
 */
export async function asegurarCodigoDeCarta(businessId: string): Promise<string> {
  const actual = await prisma.business.findUnique({
    where: { id: businessId },
    select: { menuCode: true },
  });
  if (!actual) throw new Error('Negocio no encontrado');
  if (actual.menuCode) return actual.menuCode;

  // El índice es único: si dos locales generan el mismo código a la vez, el
  // segundo choca y se reintenta. Sin este bucle, el dueño vería un error
  // ilegible de Prisma en la pantalla de mesas.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoDeCarta();
    try {
      await prisma.business.update({ where: { id: businessId }, data: { menuCode: codigo } });
      return codigo;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') throw err;
    }
  }
  throw new Error('No se pudo generar el código de la carta. Inténtalo de nuevo.');
}

export interface MesasDelNegocio {
  menuCode: string;
  tables: string[];
}

export async function getMesasDelNegocio(businessId: string): Promise<MesasDelNegocio> {
  const menuCode = await asegurarCodigoDeCarta(businessId);
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { tables: true },
  });
  return { menuCode, tables: mesasDeBD(b?.tables) };
}

/**
 * Guarda el catálogo de mesas. `saneaMesas` es quien rechaza, con su motivo:
 * este formulario se llena una vez y luego se imprimen los QR, así que un error
 * que pase aquí se descubre con los individuales ya plastificados.
 */
export async function guardarMesas(
  businessId: string,
  entrada: unknown,
): Promise<MesasDelNegocio> {
  const tables = saneaMesas(entrada);
  const menuCode = await asegurarCodigoDeCarta(businessId);
  await prisma.business.update({ where: { id: businessId }, data: { tables } });
  return { menuCode, tables };
}

/** Lo guardado en el Json, defendido de cualquier cosa que haya quedado ahí. */
function mesasDeBD(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

// ─── La carta pública (el comensal) ───────────────────────────────────────────

/**
 * La carta de un local por su código público.
 *
 * El código se acepta en minúsculas porque alguien lo va a teclear de un papel
 * cuando la cámara no lea el QR.
 */
export async function getCartaPublica(codigo: string): Promise<CartaPublicaDTO> {
  const b = await prisma.business.findFirst({
    where: { menuCode: codigo.trim().toUpperCase() },
    select: { id: true, isOpen: true, tables: true },
  });
  // `isOpen` es la cuenta activa (la controla el admin), no la vitrina. Un
  // local desactivado no tiene carta que mostrar.
  if (!b || !b.isOpen) throw new Error('Esta carta no existe o ya no está disponible');

  const { getBusinessPublicById } = await import('./business.service');
  const business = await getBusinessPublicById(b.id);
  return { business, tables: mesasDeBD(b.tables) };
}

export interface PedirEnMesaDTO {
  mesa: unknown;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    optionsSummary?: string;
    optionIds?: string[];
    notes?: string;
  }>;
  // A propósito NO se pide el nombre del comensal.
  //
  // El backend lo aceptaba y la pantalla no lo mandaba nunca: código muerto.
  // Y al decidir si recogerlo o quitarlo, gana quitarlo: **en la mesa la
  // identidad es la mesa**. El mesero no busca a nadie por nombre, camina al
  // número que dice la comanda. Un campo más en el formulario es fricción en el
  // único sitio donde toda la función consiste en no tener ninguna.
  //
  // Si algún día se quiere (locales con servicio por nombre), es una línea aquí
  // y un campo en la hoja del pedido.
}

/**
 * Crea el pedido de una mesa.
 *
 * El precio lo resuelve el MISMO núcleo que el pedido a domicilio
 * (`resolverLineasDePedido`): esta ruta es pública y sin cuenta, así que es la
 * que más falta le hace que el precio no lo decida el teléfono.
 */
export async function crearPedidoEnMesa(
  codigo: string,
  dto: PedirEnMesaDTO,
): Promise<PedidoEnMesaDTO> {
  const carta = await getCartaPublica(codigo);
  const biz = carta.business;

  // El local tiene que estar recibiendo. Sale de la MISMA función que pinta la
  // vitrina (`tiendaRecibiendo`: interruptor + horario + pausa), y se dice el
  // motivo concreto: la cocina copada quiere que el comensal sepa que son
  // veinte minutos, no que la app falló.
  if (!biz.isOpen) {
    throw new Error(
      biz.cerradoMotivo
        ? `${biz.name} no está tomando pedidos: ${biz.cerradoMotivo.toLowerCase()}.`
        : `${biz.name} no está tomando pedidos en este momento.`,
    );
  }

  if (carta.tables.length === 0) {
    throw new Error(
      `${biz.name} todavía no tiene el pedido en mesa activado. Pide con el mesero.`,
    );
  }
  // Una mesa que el dueño no declaró no puede pedir: sin esta guarda basta
  // cambiar `?mesa=5` por `?mesa=99` para meterle a la cocina un plato que
  // nadie sabe a dónde llevar.
  const mesa = mesaDelCatalogo(carta.tables, dto.mesa);
  if (!mesa) {
    throw new Error('No reconocimos la mesa. Vuelve a escanear el código de tu mesa.');
  }

  if (!Array.isArray(dto.items) || dto.items.length === 0) {
    throw new Error('Agrega algo a tu pedido.');
  }

  const { subtotal, lines, aDescontar } = await resolverLineasDePedido(biz.id, dto.items);
  await descontarInventario(aDescontar);

  const order = await prisma.order.create({
    data: {
      orderRef: `MS-${Math.floor(1000 + Math.random() * 8000)}`,
      // Sin cuenta: el comensal está sentado en el local y no tiene por qué
      // instalar nada para almorzar. Es el punto de toda la función.
      userId: null,
      businessId: biz.id,
      mode: 'DINE_IN',
      tableLabel: mesa,
      // La columna es obligatoria y todas las pantallas viejas la imprimen, así
      // que se escribe algo CIERTO y útil en vez de dejarla vacía.
      deliveryAddress: `En el local · Mesa ${mesa}`,
      // La plaza del comercio, SELLADA. El dato existe —lo tiene el negocio— y
      // sin copiarlo aquí el pedido quedaba fuera del panel por ciudad: un
      // `null` honesto es cuando no se sabe, no cuando no se miró.
      //
      // Se sella también como destino porque el pedido se consume EN el local:
      // origen y destino son el mismo sitio, y dejar el destino vacío haría
      // pensar que falta por resolver. `isIntercity` sigue en falso, así que
      // nada del camino de encomiendas se activa.
      originCitySlug: biz.citySlug ?? null,
      destCitySlug: biz.citySlug ?? null,
      // Nace PENDING: la cocina lo acepta y fija el tiempo de preparación,
      // igual que un domicilio. Lo que NO pasa al aceptar es el despacho.
      status: 'PENDING',
      subtotal,
      // Cero, y no el domicilio del local: en la mesa no hay nada que llevar.
      deliveryFee: 0,
      // La promoción de la tienda NO se aplica aquí. El dueño la publicó
      // pensando en el domicilio («pide $30.000 y te descuento $6.000»);
      // descontar en el salón sin que él lo decida le cambia lo que cobra.
      total: subtotal,
      // No se promete un tiempo que nadie ha estimado: lo fija la cocina al
      // aceptar. `etaMinutes` del negocio incluye el trayecto del repartidor.
      etaMinutes: null,
      // Sin PIN de custodia: no hay repartidor a quien entregarle nada.
      // Y sin nombre: en la mesa la identidad es la mesa.
      customerName: null,
      hasSignature: false,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  // La cocina se entera EN EL MOMENTO, por el mismo canal y con el mismo DTO
  // que un domicilio: así el portal ya existente lo pinta, lo suena y lo cuenta
  // sin cambiarle nada.
  await avisarNegocioDePedidoNuevo(order.id);

  // A propósito NO hay auto-cancelación por no aceptar. En un domicilio, el
  // cliente que espera en su casa necesita que alguien corte; aquí está
  // sentado a diez metros de la cocina y puede preguntarle al mesero. Cancelar
  // solo le quitaría el pedido de la pantalla sin resolverle el almuerzo.
  return _aDTO(order, biz.name, order.lines);
}

/** El pedido de una mesa, consultado por el comensal desde su pantalla. */
export async function getPedidoEnMesa(
  codigo: string,
  orderId: string,
): Promise<PedidoEnMesaDTO | null> {
  const carta = await getCartaPublica(codigo);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });
  // Tiene que ser de ESTE local y de mesa: si no, el código de una carta
  // serviría para leer los pedidos a domicilio del negocio, con su dirección.
  if (!order || order.businessId !== carta.business.id || order.mode !== 'DINE_IN') return null;
  return _aDTO(order, carta.business.name, order.lines);
}

/**
 * El comensal califica su pedido.
 *
 * POR QUÉ HACÍA FALTA. `rateClientOrder` exige que el pedido sea de la cuenta
 * de quien califica, y en la mesa no hay cuenta — así que un pedido en mesa no
 * se podía calificar NUNCA. La nota del restaurante salía solo de sus
 * domicilios, cuando el salón suele ser la mayor parte de lo que vende.
 *
 * Lo que aquí hace de credencial es el **id del pedido**: un cuid de
 * veinticinco caracteres aleatorios que solo tiene quien lo pidió, y que
 * además se comprueba contra ESTE local y contra que sea de mesa. La
 * referencia corta (`MS-1234`) no serviría: son ocho mil combinaciones y
 * cualquiera podría ir calificando las mesas del vecino.
 *
 * Se puede corregir, como en el resto de la plataforma: quien se equivocó de
 * estrella no se queda con ella para siempre.
 */
export async function calificarPedidoEnMesa(
  codigo: string,
  orderId: string,
  estrellas: unknown,
  comentario: unknown,
): Promise<{ rating: number; ratingComment: string | null }> {
  const carta = await getCartaPublica(codigo);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { businessId: true, mode: true },
  });
  if (!order || order.businessId !== carta.business.id || order.mode !== 'DINE_IN') {
    throw new Error('No encontramos ese pedido.');
  }
  // El resto —que esté servido, guardar y recalcular el promedio del negocio—
  // es el MISMO camino que el domicilio. Copiarlo dejaría dos sitios que
  // tendrían que cambiar juntos el día que cambie la reputación.
  return _guardarCalificacionDePedido(
    orderId,
    saneaEstrellas(estrellas),
    saneaComentario(comentario),
  );
}

/**
 * La cocina marca el plato SERVIDO, que es el cierre de un pedido en mesa.
 *
 * `DELIVERED` es el estado terminal que ya existe y significa exactamente eso
 * aquí; añadir un `SERVED` al enum obligaría a repasar cada `switch` de las dos
 * apps para un estado que solo vería el portal.
 */
export async function marcarServido(
  businessId: string,
  orderId: string,
): Promise<ClientOrderSummaryDTO | null> {
  // updateMany con guardia: el estado y la pertenencia se comprueban en la
  // MISMA escritura, así que dos toques seguidos al botón no sirven un pedido
  // dos veces ni sirven el de otro local.
  const res = await prisma.order.updateMany({
    where: { id: orderId, businessId, mode: 'DINE_IN', status: { in: ['PENDING', 'PREPARING'] } },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  if (res.count === 0) return null;
  return avisarNegocioDePedidoNuevo(orderId);
}

function _aDTO(
  o: {
    id: string; orderRef: string; tableLabel: string | null; status: string;
    subtotal: number; total: number; prepMinutes: number | null;
    acceptedAt: Date | null; createdAt: Date; rating?: number | null;
  },
  businessName: string,
  lines: Array<{
    productName: string; quantity: number; unitPrice: number; subtotal: number;
    optionsSummary: string | null; notes: string | null;
  }>,
): PedidoEnMesaDTO {
  return {
    id: o.id,
    orderRef: o.orderRef,
    tableLabel: o.tableLabel ?? '',
    businessName,
    status: nombreEstadoPedido(o.status as Parameters<typeof nombreEstadoPedido>[0]),
    subtotal: o.subtotal,
    total: o.total,
    ...(o.prepMinutes != null ? { prepMinutes: o.prepMinutes } : {}),
    ...(o.acceptedAt ? { acceptedAt: o.acceptedAt.toISOString() } : {}),
    ...(o.rating != null ? { rating: o.rating } : {}),
    createdAt: o.createdAt.toISOString(),
    items: lines.map((l) => ({
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
      ...(l.optionsSummary ? { optionsSummary: l.optionsSummary } : {}),
      ...(l.notes ? { notes: l.notes } : {}),
    })),
  };
}
