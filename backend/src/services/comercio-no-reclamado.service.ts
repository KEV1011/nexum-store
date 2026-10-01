// ── Pedirle a un comercio que todavía no es cliente ──────────────────────────
//
// Ver la cabecera de `lib/comercio-no-reclamado.ts` para el porqué comercial y
// las tres reglas que hacen que esto sea honesto. Aquí está la ejecución.
//
// NO HAY MODELO NUEVO, y es deliberado: el mandado (`Errand`) YA es exactamente
// esto —el cliente pide una compra, autoriza un presupuesto, el repartidor va,
// paga, registra el costo real y entrega con PIN—, incluido el comentario de
// su propio código diciendo que se recoge «en establecimientos que no están
// registrados en la plataforma». Construir un segundo camino de pedido al lado
// habría repartido la trazabilidad, que es la lección que ya costó cara con
// `CargoTrip` al lado de `FreightRequest`.
//
// Lo único que se añade es el PUENTE: traducir un carrito del catálogo a la
// lista de compras que el repartidor lee en el mostrador.

import { prisma } from '../lib/prisma';
import {
  listaDeCompra,
  motivoParaNoComprar,
  presupuestoSugerido,
  sumaReferencial,
  type LineaDeCompra,
} from '../lib/comercio-no-reclamado';
import { requestClientErrand, type ClientErrandWithPinsDTO } from './errand.service';
import type { BusinessCategory } from '@prisma/client';

export class CompraError extends Error {}

export interface ItemDeCompra {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface ComprarEnComercioDTO {
  businessId: string;
  items: ItemDeCompra[];
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  notes?: string;
}

/**
 * La categoría de mandado que le corresponde al comercio.
 *
 * Importa porque es lo que el repartidor ve en la oferta y lo que le dice si
 * va a cargar un almuerzo o un mercado de treinta kilos. Un mapa completo
 * (`Record<BusinessCategory, …>`) y no un `switch` con `default`: añadir una
 * categoría de comercio sin decidir su mandado NO COMPILA, que es la misma
 * guarda que ya se puso en los mapas de etiquetas.
 */
const CATEGORIA_MANDADO: Record<BusinessCategory, string> = {
  RESTAURANT: 'food',
  SUPERMARKET: 'groceries',
  PHARMACY: 'pharmacy',
  STORE: 'shopping',
  OTHER: 'shopping',
};

export interface ResultadoCompra {
  errand: ClientErrandWithPinsDTO;
  /** Para arrancar el ciclo de despacho anclado al local, no al centro. */
  pickup: { lat: number; lng: number } | null;
  /** Lo que sumaba la lista a precios de la carta, para enseñárselo al cliente. */
  referencial: number;
  presupuesto: number;
}

/**
 * Convierte un carrito de una ficha NO RECLAMADA en un mandado de compra.
 *
 * El precio lo pone la BASE, nunca el teléfono: es la misma regla del pedido
 * normal y aquí importa igual, porque de ese número sale el presupuesto que
 * se autoriza a gastar.
 */
export async function comprarEnComercio(
  clientId: string,
  dto: ComprarEnComercioDTO,
): Promise<ResultadoCompra> {
  const negocio = await prisma.business.findUnique({
    where: { id: dto.businessId },
    select: {
      id: true, name: true, address: true, lat: true, lng: true,
      category: true, claimed: true, isOpen: true,
    },
  });
  if (!negocio || !negocio.isOpen) {
    throw new CompraError('No encontramos ese comercio.');
  }
  // Este camino es SOLO para las fichas que publicamos nosotros. A un comercio
  // que sí entró al portal se le manda el pedido a su pantalla: mandarle un
  // repartidor a comprar en su mostrador sería saltarse su cocina, su
  // inventario y su cobro.
  if (negocio.claimed) {
    throw new CompraError(
      `${negocio.name} recibe pedidos directamente: pídelo desde su catálogo.`,
    );
  }
  if (!Array.isArray(dto.items) || dto.items.length === 0) {
    throw new CompraError('Agrega al menos un producto.');
  }
  if (!dto.dropoffAddress?.trim()) {
    throw new CompraError('Falta la dirección de entrega.');
  }

  // Los productos, resueltos contra la BD. La pertenencia al negocio se
  // comprueba aquí: sin eso se podría armar una lista con el precio de otro
  // local y el presupuesto saldría de un sitio que nadie eligió.
  const lineas: LineaDeCompra[] = [];
  for (const item of dto.items) {
    const p = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { businessId: true, name: true, price: true, isAvailable: true },
    });
    if (!p || p.businessId !== negocio.id) {
      throw new CompraError('Uno de los productos ya no está en esta carta.');
    }
    if (!p.isAvailable) {
      throw new CompraError(`«${p.name}» está marcado como agotado.`);
    }
    lineas.push({
      nombre: p.name,
      cantidad: Math.round(item.quantity),
      precioRef: p.price,
      notas: item.notes,
    });
  }

  const motivo = motivoParaNoComprar(lineas);
  if (motivo) throw new CompraError(motivo);

  const referencial = sumaReferencial(lineas);
  const presupuesto = presupuestoSugerido(lineas);

  const errand = await requestClientErrand(clientId, {
    category: CATEGORIA_MANDADO[negocio.category] as 'food',
    description: listaDeCompra(negocio.name, lineas),
    pickupAddress: negocio.address,
    dropoffAddress: dto.dropoffAddress.trim(),
    ...(negocio.lat != null ? { pickupLat: negocio.lat } : {}),
    ...(negocio.lng != null ? { pickupLng: negocio.lng } : {}),
    purchaseBudget: presupuesto,
    ...(dto.notes?.trim() ? { notes: dto.notes.trim() } : {}),
  });

  return {
    errand,
    pickup: negocio.lat != null && negocio.lng != null
      ? { lat: negocio.lat, lng: negocio.lng }
      : null,
    referencial,
    presupuesto,
  };
}
