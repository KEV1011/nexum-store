// ── Las líneas de un pedido y el inventario ──────────────────────────────────
//
// POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE `placeClientOrder`. Ahora hay DOS formas de
// pedir —a domicilio desde la app y desde el QR de una mesa— y esto es lo que
// decide el PRECIO y lo que descuenta EXISTENCIAS. Copiarlo habría dejado dos
// sitios donde validar el precio, y al segundo se le olvidaría: el agujero que
// esto cierra ya existió una vez (se cobraba `line.unitPrice` tal como lo
// mandaba el teléfono, así que bastaba enviar `unitPrice: 1`).
//
// Regla que no se negocia: **el precio lo decide siempre el servidor.** Lo que
// manda el cliente es qué productos y cuántos.

import { prisma } from '../lib/prisma';
import { resolverOpciones, sanearNota } from '../lib/order-options';

/** Un renglón tal como lo pidió el cliente. */
export interface ItemPedido {
  productId: string;
  quantity: number;
  /** Solo se mira en la rama antigua (apps sin `optionIds`). */
  unitPrice?: number;
  optionsSummary?: string;
  optionIds?: string[];
  notes?: string;
}

/** Un renglón ya resuelto contra el catálogo, listo para escribir. */
export interface LineaResuelta {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  optionsSummary: string | null;
  optionIds: string[];
  notes: string | null;
}

export interface LineasResueltas {
  subtotal: number;
  lines: LineaResuelta[];
  /** Productos con inventario que hay que descontar. */
  aDescontar: Array<{ productId: string; cantidad: number; nombre: string }>;
}

/**
 * Resuelve los renglones contra el catálogo del negocio: pertenencia,
 * disponibilidad, existencias y **precio de la base de datos**.
 *
 * No escribe nada. El descuento de inventario va aparte (`descontarInventario`)
 * porque solo debe ocurrir cuando ya se va a crear el pedido.
 */
export async function resolverLineasDePedido(
  businessId: string,
  items: readonly ItemPedido[],
): Promise<LineasResueltas> {
  let subtotal = 0;
  const lines: LineaResuelta[] = [];
  const aDescontar: LineasResueltas['aDescontar'] = [];

  for (const line of items) {
    if (!(line.quantity > 0)) {
      throw new Error('La cantidad de cada producto debe ser mayor a cero.');
    }
    const producto = await prisma.product.findUnique({
      where: { id: line.productId },
      include: {
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    // La pertenencia al negocio se comprueba AQUÍ: es lo que impide pedir en un
    // local el producto (y el precio) de otro.
    if (!producto || producto.businessId !== businessId) {
      throw new Error('Uno de los productos ya no está disponible en este negocio.');
    }
    if (!producto.isAvailable) {
      throw new Error(`${producto.name} no está disponible en este momento.`);
    }
    // stock null = el negocio no controla inventario (caso restaurante).
    if (producto.stock !== null && producto.stock < line.quantity) {
      throw new Error(
        producto.stock <= 0
          ? `${producto.name} se agotó.`
          : `Solo quedan ${producto.stock} de ${producto.name}.`,
      );
    }
    if (producto.stock !== null) {
      aDescontar.push({ productId: producto.id, cantidad: line.quantity, nombre: producto.name });
    }

    // ── El precio ─────────────────────────────────────────────────────────
    // Con los ids de las opciones el servidor calcula el recargo EXACTO desde
    // el catálogo, compone el resumen que leerá la cocina y rechaza cualquier
    // opción que el negocio acabe de agotar.
    //
    // Sin ids se aplica el criterio antiguo (suelo el precio del catálogo,
    // techo el triple). No es exacto y puede recortar un pedido legítimo con
    // muchas adiciones, pero hay apps instaladas que todavía mandan solo el
    // total sumado y dejarlas fuera sería peor. Cuando esas versiones se
    // hayan renovado, esta rama se retira.
    let precioUnitario: number;
    let resumen: string | null;
    let idsOpciones: string[] = [];

    if (Array.isArray(line.optionIds)) {
      const resueltas = resolverOpciones(producto.optionGroups, line.optionIds, producto.name);
      // El recargo puede ser negativo si el negocio descuenta por quitar algo;
      // el precio de una línea nunca baja de cero.
      precioUnitario = Math.max(0, producto.price + resueltas.recargo);
      resumen = resueltas.resumen;
      idsOpciones = resueltas.ids;
    } else {
      const enviado = Number(line.unitPrice) || 0;
      precioUnitario = Math.min(Math.max(producto.price, enviado), producto.price * 3);
      resumen = line.optionsSummary?.trim() || null;
    }

    const sub = line.quantity * precioUnitario;
    subtotal += sub;
    lines.push({
      productId: line.productId,
      productName: producto.name,
      quantity: line.quantity,
      unitPrice: precioUnitario,
      subtotal: sub,
      optionsSummary: resumen,
      optionIds: idsOpciones,
      notes: sanearNota(line.notes),
    });
  }

  return { subtotal, lines, aDescontar };
}

/**
 * Descuenta el inventario de los productos que lo llevan.
 *
 * `updateMany` con guardia `stock >= cantidad`: si dos clientes compran la
 * última unidad a la vez, solo uno afecta filas y el otro recibe el aviso. Se
 * llama ANTES de crear el pedido para no dejar pedidos sin respaldo, y si algo
 * se agota a mitad se devuelve lo ya descontado.
 */
export async function descontarInventario(
  aDescontar: readonly { productId: string; cantidad: number; nombre: string }[],
): Promise<void> {
  const descontados: Array<{ productId: string; cantidad: number }> = [];
  for (const item of aDescontar) {
    const res = await prisma.product.updateMany({
      where: { id: item.productId, stock: { gte: item.cantidad } },
      data: { stock: { decrement: item.cantidad } },
    });
    if (res.count === 0) {
      // Alguien se adelantó: se devuelve lo ya descontado y se avisa con el
      // nombre del producto, para que el cliente sepa qué quitar del carrito.
      for (const hecho of descontados) {
        await prisma.product.update({
          where: { id: hecho.productId },
          data: { stock: { increment: hecho.cantidad } },
        });
      }
      throw new Error(`${item.nombre} se agotó mientras confirmabas el pedido.`);
    }
    descontados.push({ productId: item.productId, cantidad: item.cantidad });
  }
}
