import { randomUUID } from 'crypto';
import { Prisma, $Enums } from '@prisma/client';
import {
  OptionGroupDTO,
  Business,
  RegisterBusinessDTO,
  DeliveryOrderSummaryDTO,
  ProductDTO,
  CreateProductDTO,
  UpdateProductDTO,
  SetProductOptionsDTO,
  BusinessSettingsDTO,
  BusinessStatsDTO,
  BusinessPublicDTO,
  BusinessCategory,
} from '../types';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { normalizeColombianPhone } from './auth.service';
import { geocodeAddress } from './geo.service';
import { plazaDeCoordenadas } from './municipality.service';
import {
  saneaDestinos, destinosDesdeBD, type DestinoEnvio,
} from '../lib/destinos-envio';
import { porcentajeDescuento, rankingMasPedido, saneaPrecioAntes, saneaPromoTienda } from '../lib/vitrina';
import {
  LARGO_FRASE, MAX_FOTOS_LOCAL, paletaDeLocal, saneaColorMarca,
} from '../lib/marca-local';
import { precioVigente, saneaFinDePromo } from '../lib/promo-producto';
import { etiquetaDeGrupo, saneaGrupo } from '../lib/texto-opciones';
import { mismoNombreDeGrupo, suenaAAcompanamiento } from '../lib/carta-rol';
import { sugerenciaDeCodigo, type SugerenciaDeCodigo } from '../lib/sugerencia-codigo';
import { reporteDeVentas, ventanaColombiana, type ReporteVentas } from '../lib/reporte-ventas';
import { promedioReputacion } from '../lib/reputacion';
import { limpiarTextoDeCarta, nombreDeProducto } from '../lib/texto-carta';
import { separarDescripcion } from '../lib/nombre-y-descripcion';
import { esElMismoNegocio } from '../lib/negocio-duplicado';
import { seDespacha } from '../lib/modo-pedido';
import {
  saneaHorario, estaDentroDelHorario, proximaApertura, horarioEnTexto,
  saneaPausa, enPausa, promoVigente, saneaVigencia, type Franja,
} from '../lib/horario-tienda';

// ─── Enum mappings ─────────────────────────────────────────────────────────────

type PrismaBusinessCategory = $Enums.BusinessCategory;

// `Record<BusinessCategory, …>` a propósito en los dos sentidos: añadir un
// valor al enum sin traducirlo aquí NO COMPILA. Es la misma guarda que ya
// evitó que un estado de pedido nuevo llegara a la app sin traducir.
const CATEGORY_TO_PRISMA: Record<BusinessCategory, PrismaBusinessCategory> = {
  restaurant: 'RESTAURANT',
  supermarket: 'SUPERMARKET',
  pharmacy: 'PHARMACY',
  store: 'STORE',
  other: 'OTHER',
};

const CATEGORY_FROM_PRISMA: Record<PrismaBusinessCategory, BusinessCategory> = {
  RESTAURANT: 'restaurant',
  SUPERMARKET: 'supermarket',
  PHARMACY: 'pharmacy',
  STORE: 'store',
  OTHER: 'other',
};

/**
 * La categoría tal como la lee la app, desde lo que hay en la columna.
 *
 * Tolera una cadena cualquiera —la columna se lee como `string` en varios
 * helpers— y cae a `other`, que es el cajón: un valor que no se reconozca no
 * puede tumbar el listado entero de comercios.
 */
function categoriaDesdeBD(valor: string): BusinessCategory {
  return CATEGORY_FROM_PRISMA[valor as PrismaBusinessCategory] ?? 'other';
}

/**
 * La categoría de BD a partir de lo que se escribe en un formulario.
 *
 * Devuelve `null` en vez de caer a `OTHER`: cuando el admin se equivoca
 * escribiendo la categoría, meterla en el cajón sin avisar deja un comercio
 * mal clasificado que nadie va a revisar. Lo correcto es decírselo.
 */
export function categoriaDesdeEspanol(
  valor: string | undefined,
): PrismaBusinessCategory | null {
  const v = (valor ?? '').trim().toLowerCase();
  return CATEGORY_TO_PRISMA[v as BusinessCategory] ?? null;
}

const DELIVERY_STATUS_FROM_PRISMA: Record<string, string> = {
  CONFIRMED: 'pending',
  AT_PICKUP: 'at_pickup',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _dbToBusinessInterface(b: {
  id: string; name: string; ownerName: string | null; phone: string | null;
  address: string; category: string; token: string; whatsapp: string | null;
  createdAt: Date; isOpen: boolean; imageUrl: string | null;
  lat?: number | null; lng?: number | null;
  citySlug?: string | null; shipsTo?: unknown;
}): Business {
  return {
    id: b.id,
    name: b.name,
    ownerName: b.ownerName ?? '',
    phone: b.phone ?? '',
    address: b.address,
    category: categoriaDesdeBD(b.category),
    accessToken: b.token,
    whatsapp: b.whatsapp ?? undefined,
    imageUrl: b.imageUrl ?? undefined,
    createdAt: b.createdAt,
    isActive: b.isOpen,
    lat: b.lat ?? undefined,
    lng: b.lng ?? undefined,
    citySlug: b.citySlug ?? null,
    shipsTo: destinosDesdeBD(b.shipsTo),
  };
}

function _toSummaryDTO(order: {
  id: string; orderRef: string; customerName: string | null; deliveryAddress: string;
  status: string; total: number; createdAt: Date; pickedUpAt: Date | null; deliveredAt: Date | null;
  pickupPhotoUrl: string | null; deliveryPhotoUrl: string | null;
  signatureUrl: string | null; signedByName: string | null; signedAt: Date | null;
  driverName: string | null; driverPhone: string | null; pickupPin?: string | null;
}): DeliveryOrderSummaryDTO {
  const hasPickupProof = !!order.pickupPhotoUrl;
  // Derivado del archivo, nunca de un flag guardado: si fueran dos datos,
  // acabarían diciendo que hay firma donde no la hay.
  const hasSignature = !!order.signatureUrl;
  const hasDeliveryProof = !!order.deliveryPhotoUrl || hasSignature;
  return {
    id: order.id,
    orderRef: order.orderRef,
    customerName: order.customerName ?? '',
    customerAddress: order.deliveryAddress,
    status: (DELIVERY_STATUS_FROM_PRISMA[order.status] ?? 'pending') as DeliveryOrderSummaryDTO['status'],
    grossFare: order.total,
    createdAt: order.createdAt.toISOString(),
    pickedUpAt: order.pickedUpAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    pickupPhotoUrl: order.pickupPhotoUrl ?? undefined,
    deliveryPhotoUrl: order.deliveryPhotoUrl ?? undefined,
    // PIN que el negocio dicta al repartidor para entregarle el pedido. Este
    // portal es del dueño del negocio (token propio); el repartidor no lo ve.
    pickupPin: order.pickupPin ?? undefined,
    hasSignature,
    signatureUrl: order.signatureUrl ?? undefined,
    signedByName: order.signedByName ?? undefined,
    signedAt: order.signedAt?.toISOString(),
    driverName: order.driverName ?? '',
    // Privacy: the driver's real number is never exposed to the business.
    driverPhone: maskPhone(order.driverPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(order.driverPhone),
    hasPickupProof,
    hasDeliveryProof,
    hasFullCustody: hasPickupProof && hasDeliveryProof,
  };
}

/**
 * El negocio de este teléfono que ya se llama igual, o `null`.
 *
 * Solo caza el doble envío del mismo formulario: mismo teléfono Y mismo
 * nombre. Un dueño con dos locales distintos («Pieros» y «Pieros Pizza») sigue
 * pudiendo registrar los dos.
 */
async function _negocioYaRegistrado(
  telefono: string,
  nombre: string,
): Promise<Business | null> {
  const normal = normalizeColombianPhone(telefono);
  const ultimos4 = normal.slice(-4);
  if (!/^\d{4}$/.test(ultimos4)) return null;

  const candidatos = await prisma.business.findMany({
    where: { phone: { endsWith: ultimos4 } },
    take: 50,
  });
  const yaEsta = candidatos.find(
    (b) =>
      normalizeColombianPhone(b.phone ?? '') === normal &&
      esElMismoNegocio(b.name, nombre),
  );
  return yaEsta ? _dbToBusinessInterface(yaEsta) : null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const service = {
  // ── Business registration ────────────────────────────────────────────────

  async registerBusiness(dto: RegisterBusinessDTO): Promise<Business> {
    // Un segundo toque en «Registrar» NO crea un segundo negocio.
    //
    // La ruta es pública y se usa desde un celular con mala señal: sin esta
    // comprobación quedaban dos portales con enlaces distintos, el dueño
    // cargaba el catálogo en uno y los clientes pedían en el otro, vacío.
    // Se devuelve el que ya existe en vez de rechazar: quien pulsó dos veces
    // quiere su portal, no un error.
    //
    // El criterio de teléfono es EL MISMO de `findBusinessesByPhone` —últimos
    // cuatro dígitos y comparación normalizada— porque el teléfono se guardó
    // como lo escribió el dueño. Con dos criterios, el registro diría «ya lo
    // tienes» y la recuperación no lo encontraría.
    const yaRegistrado = await _negocioYaRegistrado(dto.phone, dto.name);
    if (yaRegistrado) return yaRegistrado;

    const token = randomUUID().replace(/-/g, '').slice(0, 12);
    // Coordenadas desde la dirección escrita: sin ellas, el despacho de sus
    // pedidos se ancla al centro del pueblo y el cliente no ve dónde está el
    // negocio en el mapa. Best-effort puro: si no hay llave de Google o la
    // dirección no se resuelve, el registro continúa igual (el dueño puede
    // fijar el punto después desde Ajustes).
    const geo = await geocodeAddress(dto.address).catch(() => null);
    // La plaza sale del MISMO resolutor que la de viajes y conductores. Si el
    // comercio usara otro criterio, un pedido podría ser «de Cúcuta» para la
    // tienda y de otra plaza para el tablero, y nadie sabría cuál miente.
    const citySlug = await plazaDeCoordenadas(geo?.lat, geo?.lng);
    const biz = await prisma.business.create({
      data: {
        name: dto.name,
        ownerName: dto.ownerName,
        phone: dto.phone,
        address: dto.address,
        category: CATEGORY_TO_PRISMA[dto.category] ?? 'OTHER',
        whatsapp: dto.whatsapp ?? null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        citySlug,
        token,
        isOpen: true,
      },
    });
    return _dbToBusinessInterface(biz);
  },

  // ── Auth via access token ─────────────────────────────────────────────────

  async getBusinessByToken(token: string): Promise<Business> {
    const biz = await prisma.business.findUnique({ where: { token } });
    if (!biz) throw new Error(`Business not found for token: ${token}`);
    if (!biz.isOpen) throw new Error('Business account is not active');
    return _dbToBusinessInterface(biz);
  },

  async getBusinessById(id: string): Promise<Business> {
    const biz = await prisma.business.findUnique({ where: { id } });
    if (!biz) throw new Error(`Business ${id} not found`);
    return _dbToBusinessInterface(biz);
  },

  // ── Orders ────────────────────────────────────────────────────────────────

  async getTodayOrdersForBusiness(businessId: string): Promise<DeliveryOrderSummaryDTO[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const orders = await prisma.order.findMany({
      // `mode: 'DELIVERY'` es obligatorio aquí: un pedido en mesa también tiene
      // `userId: null` (el comensal no necesita cuenta), así que sin el filtro
      // saldría en esta lista Y en la de pedidos online — el mismo plato
      // contado dos veces en el portal y en las cifras del día.
      where: { businessId, createdAt: { gte: today }, userId: null, mode: 'DELIVERY' },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(_toSummaryDTO);
  },

  async getOrderDetail(orderId: string, businessId: string): Promise<DeliveryOrderSummaryDTO> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.businessId !== businessId) throw new Error('Order does not belong to this business');
    return _toSummaryDTO(order);
  },

  // ── Stats ─────────────────────────────────────────────────────────────────

  /**
   * Las cifras del día del dueño.
   *
   * `delivered`, `inTransit` y la custodia son de DOMICILIO: salen de
   * `getTodayOrdersForBusiness`, que filtra por `mode: 'DELIVERY'`. Los de mesa
   * van aparte y por eso se cuentan con su propia consulta.
   *
   * Contarlos juntos fue el defecto que esto corrige: al separar la lista para
   * que un pedido en mesa no saliera dos veces, «Entregados» dejó de contarlos
   * mientras «En preparación» —que sale de otra lista— los seguía contando. El
   * dueño veía dos números del mismo día que no cuadraban entre sí.
   *
   * Y va el DINERO, que es lo que de verdad quiere saber: cuánto vendió en el
   * salón y cuánto a domicilio. El total de mesa no incluye domicilio porque
   * ahí no se cobra ninguno.
   */
  async getDayStats(businessId: string) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [orders, mesa] = await Promise.all([
      this.getTodayOrdersForBusiness(businessId),
      prisma.order.findMany({
        where: { businessId, createdAt: { gte: hoy }, mode: 'DINE_IN' },
        select: { status: true, total: true },
      }),
    ]);
    const delivered = orders.filter((o) => o.status === 'delivered');
    const fullCustody = delivered.filter((o) => o.hasFullCustody).length;

    // Lo vendido: lo entregado a domicilio y lo servido en mesa. Lo cancelado
    // no se cuenta —nadie lo pagó— y lo que está en curso tampoco, porque
    // todavía puede caerse.
    const servidosEnMesa = mesa.filter((o) => o.status === 'DELIVERED');
    const ventaSalon = servidosEnMesa.reduce((s, o) => s + o.total, 0);
    const ventaDomicilio = delivered.reduce((s, o) => s + o.grossFare, 0);

    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending' || o.status === 'at_pickup').length,
      inTransit: orders.filter((o) => o.status === 'in_transit').length,
      delivered: delivered.length,
      fullCustodyRate: delivered.length === 0 ? 0 : fullCustody / delivered.length,
      // ── Salón ──────────────────────────────────────────────────────────────
      /** Pedidos de mesa de hoy, en cualquier estado. */
      enMesa: mesa.length,
      /** De esos, los que ya salieron a la mesa. */
      servidosEnMesa: servidosEnMesa.length,
      /** De mesa, esperando o cocinándose. */
      enMesaEnCurso: mesa.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING').length,
      ventaSalon,
      ventaDomicilio,
    };
  },
};

export function getBusinessService() {
  return service;
}

// ─── Public helpers used by client.service ────────────────────────────────────

// Mapper compartido Product (Prisma) → ProductDTO. Centraliza `imageUrl` para
// que ninguna respuesta olvide la foto del producto.
function _productToDTO(p: {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice?: number | null;
  category: string;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder?: number;
  barcode?: string | null;
  sku?: string | null;
  stock?: number | null;
  unit?: string | null;
  brand?: string | null;
  promoUntil?: Date | string | null;
  model?: string | null;
  warrantyMonths?: number | null;
  photos?: { id: string; url: string }[];
  suggestAsAddon?: boolean;
  gruposOpciones?: {
    group: {
      id: string;
      name: string;
      required: boolean;
      minSelect: number;
      maxSelect: number;
      options: { id: string; name: string; priceDelta: number; isAvailable: boolean }[];
    };
  }[];
}): ProductDTO {
  // El precio que SE COBRA ahora. Es la misma función que usa la caja
  // (`order-lines.service`): con una promoción vencida, `price` todavía
  // guarda el rebajado, y si cada lado lo resolviera por su cuenta la
  // pantalla y el cobro acabarían diciendo cosas distintas.
  const v = precioVigente(p);
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    description: p.description ?? '',
    price: v.precio,
    category: p.category,
    imageUrl: p.imageUrl ?? undefined,
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder ?? 0,
    // Sin promoción viva no se tacha nada: un precio tachado que ya no rige
    // anuncia un descuento que la caja no va a aplicar.
    compareAtPrice: v.antes ?? undefined,
    promoUntil: (v.enPromo && p.promoUntil) ? new Date(p.promoUntil).toISOString() : undefined,
    // El porcentaje se calcula UNA vez, aquí: si cada pantalla lo derivara,
    // acabarían redondeando distinto y el «-46 %» del listado no coincidiría
    // con el del detalle.
    descuentoPct: porcentajeDescuento(v.precio, v.antes) ?? undefined,
    barcode: p.barcode ?? undefined,
    sku: p.sku ?? undefined,
    stock: p.stock ?? undefined,
    unit: p.unit ?? undefined,
    brand: p.brand ?? undefined,
    model: p.model ?? undefined,
    warrantyMonths: p.warrantyMonths ?? undefined,
    images: (p.photos ?? []).map((ph) => ({ id: ph.id, url: ph.url })),
    suggestAsAddon: p.suggestAsAddon ?? false,
    pareceAcompanamiento: suenaAAcompanamiento(p.name, p.category ?? ''),
    optionGroups: (p.gruposOpciones ?? []).map(({ group: g }) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      label: etiquetaDeGrupo(g),
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        isAvailable: o.isAvailable,
      })),
    })),
  };
}

/**
 * ¿La tienda está recibiendo pedidos AHORA?
 *
 * Tres condiciones, y las tres tienen que darse. Vive en una sola función
 * porque la usan la vitrina, el detalle y —lo que importa— la creación del
 * pedido: si la pantalla y la caja lo decidieran por separado, el cliente
 * vería «cerrado» y aun así podría pedir, o al revés.
 */
export function tiendaRecibiendo(b: {
  acceptingOrders: boolean;
  hours?: unknown;
  pausedUntil?: Date | null;
}, ahora = new Date()): { abierta: boolean; motivo: string | null } {
  if (!b.acceptingOrders) return { abierta: false, motivo: 'No está recibiendo pedidos' };
  if (enPausa(b.pausedUntil, ahora)) {
    return { abierta: false, motivo: 'Pausado temporalmente' };
  }
  const franjas = _franjas(b.hours);
  if (!estaDentroDelHorario(franjas, ahora)) {
    return { abierta: false, motivo: proximaApertura(franjas, ahora) ?? 'Cerrado ahora' };
  }
  return { abierta: true, motivo: null };
}

/**
 * Lo que la vitrina dice del estado de la tienda: si recibe, por qué no, su
 * horario y su promoción — con la promoción CALLADA si no está vigente,
 * porque anunciar una que ya venció es prometer lo que la caja no aplica.
 */
function _estadoVitrina(b: {
  acceptingOrders: boolean; hours: unknown; pausedUntil: Date | null;
  pauseReason: string | null; openingHours: string | null;
  promoMinAmount: number | null; promoDiscount: number | null;
  promoFrom: Date | null; promoUntil: Date | null;
  claimed?: boolean;
}) {
  const estado = tiendaRecibiendo(b);
  const franjas = _franjas(b.hours);
  const vigente = promoVigente(b.promoFrom, b.promoUntil);
  return {
    isOpen: estado.abierta,
    cerradoMotivo: estado.abierta ? undefined : (b.pauseReason || estado.motivo || undefined),
    // Si el local es nuestro cliente o si la ficha la abrimos nosotros desde
    // una foto de su carta. Sale de AQUÍ, el mismo sitio del que sale si está
    // abierta, para que la lista y el detalle no puedan contradecirse: uno
    // diciendo «precios de referencia» y el otro cobrando como si fueran
    // firmes es exactamente la queja que esto quiere evitar.
    claimed: b.claimed ?? true,
    // El horario en texto sale del estructurado si lo hay; si no, del campo
    // libre de siempre, que es lo único que tienen los negocios ya registrados.
    openingHours: horarioEnTexto(franjas) || b.openingHours || undefined,
    hours: franjas.length ? franjas : undefined,
    promoMinAmount: vigente ? (b.promoMinAmount ?? undefined) : undefined,
    promoDiscount: vigente ? (b.promoDiscount ?? undefined) : undefined,
  };
}

/** El horario guardado como JSON, tolerando basura sin reventar. */
function _franjas(hours: unknown): Franja[] {
  if (!Array.isArray(hours)) return [];
  try {
    return saneaHorario(hours);
  } catch {
    // Un horario corrupto en la base NO puede cerrar una tienda: se ignora y
    // la tienda queda como estaba antes de tener horario.
    return [];
  }
}

/**
 * Marca los productos que más se piden en ESA tienda.
 *
 * Sale de las líneas de pedidos ya entregados: es un dato real, no una
 * curaduría. Si la tienda no ha vendido lo suficiente, `rankingMasPedido`
 * devuelve vacío y no se marca nada — un «#1 más pedido» sobre tres unidades
 * solo dice qué compró la última persona que entró.
 *
 * Best-effort: si la consulta falla, la carta sale sin insignias en vez de no
 * salir. Es adorno, no el pedido.
 */
async function _conMasPedido(businessId: string, productos: ProductDTO[]): Promise<ProductDTO[]> {
  try {
    const filas = await prisma.orderLine.groupBy({
      by: ['productId'],
      where: { order: { businessId, status: 'DELIVERED' } },
      _sum: { quantity: true },
    });
    const unidades = new Map<string, number>();
    for (const f of filas) {
      // `productId` es opcional en la línea: un producto borrado deja la línea
      // con su nombre pero sin referencia, y esa venta ya no se le puede
      // atribuir a nada que siga en la carta.
      if (f.productId) unidades.set(f.productId, f._sum?.quantity ?? 0);
    }
    const puestos = new Map(
      rankingMasPedido(unidades).map((r) => [r.productId, r.puesto]),
    );
    if (puestos.size === 0) return productos;
    return productos.map((p) =>
      puestos.has(p.id) ? { ...p, masPedidoPuesto: puestos.get(p.id) } : p,
    );
  } catch {
    return productos;
  }
}

// Incluir galería y grupos de opciones ordenados en cada consulta de producto.
const _photoInclude = {
  photos: { orderBy: { sortOrder: 'asc' as const } },
  // Los grupos cuelgan del NEGOCIO y el plato los adjunta, así que se leen por
  // el puente. El orden es el del plato (`ProductOptionGroup.sortOrder`), que
  // puede no ser el de la biblioteca: en una hamburguesa el tamaño va primero
  // y en un jugo no hay tamaño.
  gruposOpciones: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      group: { include: { options: { orderBy: { sortOrder: 'asc' as const } } } },
    },
  },
};

export async function getProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId, isAvailable: true },
    orderBy: { createdAt: 'asc' },
    include: _photoInclude,
  });
  return products.map(_productToDTO);
}

/**
 * Reordena la carta. Devuelve el catálogo ya ordenado.
 *
 * El `businessId` va en el `where` de cada actualización, no en una
 * comprobación previa: así un token no puede reordenar —ni tocar— el catálogo
 * de otro negocio ni aunque acierte con un id ajeno. Los ids que no sean suyos
 * simplemente no afectan filas.
 *
 * Todo en una transacción: media carta reordenada es peor que ninguna, porque
 * el dueño no sabría qué quedó donde.
 */
export async function reorderBusinessProducts(
  businessId: string,
  orden: Array<{ id: string; sortOrder: number }>,
): Promise<ProductDTO[]> {
  await prisma.$transaction(
    orden.map((o) =>
      prisma.product.updateMany({
        where: { id: o.id, businessId },
        data: { sortOrder: o.sortOrder },
      }),
    ),
  );
  return getManagedProductsForBusiness(businessId);
}

// Catálogo COMPLETO para gestión (incluye no disponibles). Solo para el portal.
export async function getManagedProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId },
    // El dueño tiene que ver su carta en el MISMO orden en que la ve el
    // cliente; si no, ordenarla a ciegas es imposible.
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: _photoInclude,
  });
  return products.map(_productToDTO);
}

export async function getProductById(productId: string): Promise<ProductDTO | undefined> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: _photoInclude,
  });
  if (!p) return undefined;
  return _productToDTO(p);
}

// ─── Galería de fotos del producto ────────────────────────────────────────────

async function _assertProductOwnership(businessId: string, productId: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
}

/** Agrega una foto a la galería del producto. Devuelve el producto actualizado. */
export async function addProductPhoto(
  businessId: string,
  productId: string,
  url: string,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);
  const count = await prisma.productPhoto.count({ where: { productId } });
  await prisma.productPhoto.create({
    data: { productId, url, sortOrder: count },
  });
  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

/** Elimina una foto de la galería del producto. */
export async function deleteProductPhoto(
  businessId: string,
  productId: string,
  photoId: string,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);
  await prisma.productPhoto.deleteMany({ where: { id: photoId, productId } });
  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

// ─── Variantes / opciones del producto ────────────────────────────────────────

/**
 * Reemplaza TODAS las opciones del producto por la estructura recibida (el
 * portal edita todo y guarda de una vez). Borra los grupos existentes (cascade
 * borra sus opciones) y recrea. Devuelve el producto actualizado.
 */
export async function setProductOptions(
  businessId: string,
  productId: string,
  dto: SetProductOptionsDTO,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);

  const saneados: Array<{ id?: string; grupo: ReturnType<typeof _grupoSanoOFalla> }> = [];
  for (const g of dto.groups ?? []) {
    saneados.push({ ...(g.id ? { id: g.id } : {}), grupo: _grupoSanoOFalla(g) });
  }

  // Un id que no sea de este negocio no se toca: con el id de otro local se
  // podrían reescribir sus precios desde aquí.
  const ajenos = saneados.filter((x) => x.id).map((x) => x.id!);
  if (ajenos.length > 0) {
    const mios = await prisma.optionGroup.count({
      where: { id: { in: ajenos }, businessId },
    });
    if (mios !== new Set(ajenos).size) {
      throw new Error('Uno de los grupos no es de este negocio.');
    }
  }

  await prisma.$transaction(async (tx) => {
    const adjuntar: string[] = [];
    for (const { id, grupo } of saneados) {
      if (id) {
        // Editar un grupo COMPARTIDO lo cambia en todos los platos que lo
        // usan. Es justo lo que se quiere —el precio del aguacate vive en un
        // sitio— y por eso el portal avisa antes de guardar.
        await tx.optionGroup.update({
          where: { id },
          data: {
            name: grupo.name,
            required: grupo.required,
            minSelect: grupo.minSelect,
            maxSelect: grupo.maxSelect,
            options: {
              deleteMany: {},
              create: grupo.options.map((o, oi) => ({ ...o, sortOrder: oi })),
            },
          },
        });
        adjuntar.push(id);
      } else {
        const creado = await tx.optionGroup.create({
          data: {
            businessId,
            name: grupo.name,
            required: grupo.required,
            minSelect: grupo.minSelect,
            maxSelect: grupo.maxSelect,
            options: { create: grupo.options.map((o, oi) => ({ ...o, sortOrder: oi })) },
          },
        });
        adjuntar.push(creado.id);
      }
    }

    // Los que el plato deja de usar se DESADJUNTAN, no se borran: puede
    // usarlos otro plato, y aunque no, siguen en la biblioteca para volver a
    // ponerlos. Borrarlos aquí haría perder un grupo de treinta adiciones por
    // haberlo quitado de un solo producto.
    await tx.productOptionGroup.deleteMany({ where: { productId } });
    for (const [i, groupId] of adjuntar.entries()) {
      await tx.productOptionGroup.create({ data: { productId, groupId, sortOrder: i } });
    }
  });

  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

/** Sanea y lanza con el motivo en español, que es lo que lee el dueño. */
function _grupoSanoOFalla(g: SetProductOptionsDTO['groups'][number]) {
  const r = saneaGrupo(g);
  if ('error' in r) throw new Error(r.error);
  return r.grupo;
}

// ─── La biblioteca de adiciones del negocio ──────────────────────────────────
//
// POR QUÉ EXISTE. Antes un grupo colgaba de un plato, así que las once
// «ADICIONALES» de una carta de doce arepas eran 132 filas escritas a mano, y
// subir el aguacate pedía tocar doce sitios. Aquí el grupo se crea UNA vez y
// los platos lo adjuntan.

/** Los grupos del negocio con en cuántos platos se usa cada uno. */
export async function listOptionGroups(businessId: string): Promise<OptionGroupDTO[]> {
  const grupos = await prisma.optionGroup.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { usos: true } },
    },
  });
  return grupos.map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    label: etiquetaDeGrupo(g),
    usedBy: g._count.usos,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: o.priceDelta,
      isAvailable: o.isAvailable,
    })),
  }));
}

/** Crea o actualiza un grupo de la biblioteca, sin tocar a qué platos va. */
export async function upsertOptionGroup(
  businessId: string,
  groupId: string | undefined,
  dto: SetProductOptionsDTO['groups'][number],
): Promise<OptionGroupDTO[]> {
  const grupo = _grupoSanoOFalla(dto);
  const datos = {
    name: grupo.name,
    required: grupo.required,
    minSelect: grupo.minSelect,
    maxSelect: grupo.maxSelect,
  };
  if (groupId) {
    // `updateMany` con businessId en el where: el id de otro local no entra.
    const tocadas = await prisma.optionGroup.updateMany({
      where: { id: groupId, businessId },
      data: datos,
    });
    if (tocadas.count === 0) throw new Error('Ese grupo no existe en este negocio.');
    await prisma.productOption.deleteMany({ where: { groupId } });
    await prisma.productOption.createMany({
      data: grupo.options.map((o, i) => ({ ...o, groupId, sortOrder: i })),
    });
  } else {
    await prisma.optionGroup.create({
      data: {
        businessId,
        ...datos,
        options: { create: grupo.options.map((o, i) => ({ ...o, sortOrder: i })) },
      },
    });
  }
  return listOptionGroups(businessId);
}

/** Borra un grupo de la biblioteca; se cae solo de los platos que lo usaban. */
export async function deleteOptionGroup(
  businessId: string,
  groupId: string,
): Promise<OptionGroupDTO[]> {
  const borradas = await prisma.optionGroup.deleteMany({ where: { id: groupId, businessId } });
  if (borradas.count === 0) throw new Error('Ese grupo no existe en este negocio.');
  return listOptionGroups(businessId);
}

/**
 * Adjunta un grupo a TODOS los platos de una sección.
 *
 * Es la acción que de verdad ahorra la tarde: las once adiciones a las doce
 * arepas en un toque. Se escriben las filas de una vez, EXPLÍCITAMENTE, en vez
 * de guardar «este grupo aplica a la categoría X» — porque entonces un plato
 * que cambia de sección perdería sus adiciones sin que nadie lo tocara, y eso
 * no se nota hasta que un cliente no puede pedir el aguacate.
 *
 * Devuelve a cuántos platos se añadió (los que ya lo tenían no cuentan).
 */
export async function applyOptionGroupToCategory(
  businessId: string,
  groupId: string,
  categoria: string,
): Promise<{ anadidos: number; total: number }> {
  const grupo = await prisma.optionGroup.findFirst({ where: { id: groupId, businessId } });
  if (!grupo) throw new Error('Ese grupo no existe en este negocio.');

  const where = categoria.trim()
    ? { businessId, category: categoria.trim() }
    : { businessId };
  const productos = await prisma.product.findMany({ where, select: { id: true } });
  if (productos.length === 0) throw new Error('Esa sección no tiene productos.');

  const yaLoTienen = new Set(
    (await prisma.productOptionGroup.findMany({
      where: { groupId, productId: { in: productos.map((p) => p.id) } },
      select: { productId: true },
    })).map((r) => r.productId),
  );
  const faltan = productos.filter((p) => !yaLoTienen.has(p.id));

  if (faltan.length > 0) {
    // `sortOrder` al final: el grupo nuevo se añade DEBAJO de los que el plato
    // ya tenía, que es donde el dueño espera encontrarlo.
    await prisma.productOptionGroup.createMany({
      data: faltan.map((p) => ({ productId: p.id, groupId, sortOrder: 99 })),
      skipDuplicates: true,
    });
  }
  return { anadidos: faltan.length, total: productos.length };
}

/**
 * Lo que la carta por foto deja hecho DESPUÉS de crear los productos: marca
 * los acompañamientos y monta los adicionales en la biblioteca, adjuntos a sus
 * platos.
 *
 * LOS ADICIONALES NO SON PRODUCTOS. «Queso 3.000» como producto suelto se
 * podría pedir solo, a domicilio, y la cocina recibiría «un queso» sin saber
 * de qué plato. Por eso cada sección de adicionales es UN grupo de la
 * biblioteca (opcional, «hasta N») que los platos adjuntan.
 *
 * SI EL GRUPO YA EXISTE con ese nombre —el dueño volvió a subir la carta, o ya
 * lo había armado a mano— se le AÑADEN las opciones que le falten y nada más:
 * no se le cambia ningún precio. Reescribirlo pisaría lo que el dueño corrigió
 * a mano; duplicarlo dejaría dos «Adicionales» en cada plato.
 *
 * Los grupos llegan YA saneados por la ruta, antes de crear nada.
 */
export async function aplicarRolesDeCarta(
  businessId: string,
  datos: {
    acompanamientoIds: string[];
    platos: Array<{ id: string; seccion: string }>;
    grupos: Array<{ nombre: string; opciones: Array<{ nombre: string; precio: number }>; aplicarA: string[] }>;
  },
): Promise<{ acompanamientos: number; grupos: number; opcionesNuevas: number; platosConAdicionales: number }> {
  let acompanamientos = 0;
  if (datos.acompanamientoIds.length > 0) {
    // `businessId` en el where: un id que no sea de este local no se toca.
    const r = await prisma.product.updateMany({
      where: { id: { in: datos.acompanamientoIds }, businessId },
      data: { suggestAsAddon: true },
    });
    acompanamientos = r.count;
  }

  let opcionesNuevas = 0;
  const platosTocados = new Set<string>();
  const existentes = await prisma.optionGroup.findMany({
    where: { businessId },
    select: { id: true, name: true, maxSelect: true, options: { select: { name: true } } },
  });

  for (const g of datos.grupos) {
    const ya = existentes.find((e) => mismoNombreDeGrupo(e.name, g.nombre));
    let groupId: string;
    if (ya) {
      const tiene = new Set(ya.options.map((o) => o.name.trim().toLowerCase()));
      const faltan = g.opciones.filter((o) => !tiene.has(o.nombre.trim().toLowerCase()));
      if (faltan.length > 0) {
        await prisma.productOption.createMany({
          data: faltan.map((o, i) => ({
            groupId: ya.id,
            name: o.nombre,
            priceDelta: o.precio,
            sortOrder: ya.options.length + i,
          })),
        });
        opcionesNuevas += faltan.length;
        // Si el grupo era «hasta todas» (el máximo cubría todas sus opciones),
        // lo sigue siendo: quedarse en «hasta 1» tras añadir el huevo haría
        // que el cliente no pudiera pedir queso Y huevo, que antes sí podía.
        if (ya.maxSelect >= ya.options.length) {
          await prisma.optionGroup.update({
            where: { id: ya.id },
            data: { maxSelect: ya.options.length + faltan.length },
          });
        }
      }
      groupId = ya.id;
    } else {
      const creado = await prisma.optionGroup.create({
        data: {
          businessId,
          name: g.nombre,
          required: false,
          minSelect: 0,
          // «Hasta N»: un adicional se puede pedir junto con los demás.
          maxSelect: g.opciones.length,
          options: {
            create: g.opciones.map((o, i) => ({ name: o.nombre, priceDelta: o.precio, sortOrder: i })),
          },
        },
      });
      opcionesNuevas += g.opciones.length;
      groupId = creado.id;
      // Que el siguiente grupo de esta misma carta lo vea como existente.
      existentes.push({ id: creado.id, name: creado.name, maxSelect: creado.maxSelect, options: g.opciones.map((o) => ({ name: o.nombre })) });
    }

    const destino = new Set(g.aplicarA.map((x) => x.trim().toLowerCase()));
    const platos = datos.platos.filter((p) => destino.has(p.seccion.trim().toLowerCase()));
    if (platos.length > 0) {
      await prisma.productOptionGroup.createMany({
        data: platos.map((p) => ({ productId: p.id, groupId, sortOrder: 99 })),
        skipDuplicates: true,
      });
      for (const p of platos) platosTocados.add(p.id);
    }
  }

  return {
    acompanamientos,
    grupos: datos.grupos.length,
    opcionesNuevas,
    platosConAdicionales: platosTocados.size,
  };
}

// ─── Gestión del catálogo (dueño desde el portal, autenticado por token) ──────

/**
 * Normaliza los campos de inventario que llegan del portal. Un texto vacío se
 * guarda como null (no como ""), para que "sin código de barras" y "código
 * vacío" sean la misma cosa y el índice no se llene de cadenas vacías.
 */
function _inventarioData(dto: {
  barcode?: string; sku?: string; stock?: number | null; unit?: string; brand?: string;
  model?: string; warrantyMonths?: number | null;
}) {
  const limpio = (v?: string) => (v?.trim() ? v.trim() : null);
  return {
    ...(dto.barcode !== undefined && { barcode: limpio(dto.barcode) }),
    ...(dto.sku !== undefined && { sku: limpio(dto.sku) }),
    // null explícito = el negocio deja de controlar inventario del producto.
    ...(dto.stock !== undefined && {
      stock: dto.stock === null ? null : Math.max(0, Math.trunc(Number(dto.stock) || 0)),
    }),
    ...(dto.unit !== undefined && { unit: limpio(dto.unit) }),
    ...(dto.brand !== undefined && { brand: limpio(dto.brand) }),
    ...(dto.model !== undefined && { model: limpio(dto.model) }),
    // La garantía se guarda en MESES enteros y no negativos. Un «24» mal
    // escrito como «-24» dejaría una ficha que promete una garantía imposible.
    ...(dto.warrantyMonths !== undefined && {
      warrantyMonths: dto.warrantyMonths === null
        ? null
        : Math.max(0, Math.trunc(Number(dto.warrantyMonths) || 0)) || null,
    }),
  };
}

/**
 * Busca un producto por su código de barras DENTRO de un negocio. El mismo EAN
 * existe en muchos comercios y cada uno tiene su precio, por eso la búsqueda
 * siempre va acotada al negocio. Devuelve null si no lo tiene todavía.
 */
export async function findProductByBarcode(
  businessId: string,
  barcode: string,
): Promise<ProductDTO | null> {
  const codigo = barcode.trim();
  if (!codigo) return null;
  const p = await prisma.product.findFirst({
    where: { businessId, barcode: codigo },
    include: _photoInclude,
  });
  return p ? _productToDTO(p) : null;
}

/**
 * Qué proponerle al dueño para un código que él NO tiene, a partir de cómo lo
 * tienen registrado los demás comercios de la plataforma.
 *
 * El reporte era «solo se sube un código, mas no reconoce el producto»: el
 * escáner rellenaba trece dígitos y el nombre quedaba en blanco, así que había
 * que teclearlo igual. El dato ya estaba en la base.
 *
 * El PRECIO no se consulta ni se devuelve — ver `sugerencia-codigo.ts`. Se
 * limita el número de filas porque un EAN muy común lo tienen cientos de
 * comercios y para votar un nombre bastan unos pocos.
 */
export async function suggestProductByBarcode(
  businessId: string,
  barcode: string,
): Promise<SugerenciaDeCodigo | null> {
  const codigo = barcode.trim();
  if (!codigo) return null;
  const filas = await prisma.product.findMany({
    where: { barcode: codigo, businessId: { not: businessId } },
    select: { name: true, brand: true, unit: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  return sugerenciaDeCodigo(filas);
}

/**
 * Todos los códigos de barras que el negocio ya tiene, para que la vista previa
 * del CSV sepa qué fila crea y cuál actualiza.
 */
export async function getBarcodeIndexForBusiness(
  businessId: string,
): Promise<Map<string, { id: string; name: string }>> {
  const rows = await prisma.product.findMany({
    where: { businessId, barcode: { not: null } },
    select: { id: true, name: true, barcode: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    if (r.barcode) map.set(r.barcode, { id: r.id, name: r.name });
  }
  return map;
}

/**
 * Aplica una importación YA revisada por el dueño. Crea los nuevos y actualiza
 * los existentes; las filas con error nunca llegan aquí (se descartaron en la
 * vista previa). Devuelve el recuento real de lo aplicado.
 */
export async function applyProductImport(
  businessId: string,
  nuevos: Array<{ nombre: string; precio: number; seccion: string; descripcion?: string;
    barcode?: string; brand?: string; unit?: string; stock?: number | null }>,
  actualizaciones: Array<{ productId: string; nombre: string; precio: number; seccion: string;
    descripcion?: string; barcode?: string; brand?: string; unit?: string; stock?: number | null }>,
): Promise<{ creados: number; actualizados: number; idsNuevos: string[] }> {
  let creados = 0;
  let actualizados = 0;
  // Alineado con `nuevos`, posición a posición: la carta por foto necesita el
  // id del producto que acaba de crear para colgarle sus tamaños, y buscarlo
  // después por nombre fallaría justo donde más duele —dos platos que se
  // llaman igual—.
  const idsNuevos: string[] = [];

  // El nombre y la sección pasan por el limpiador IGUAL que en el alta normal.
  // Antes se escribían crudos: `createBusinessProduct` sí aplica
  // `nombreDeProducto`, pero esta ruta —que es por donde entran el CSV y la
  // carta leída de una foto, o sea justo de donde vienen las viñetas del
  // papel— escribía directo y se las saltaba.
  for (const n of nuevos) {
    const creado = await prisma.product.create({
      data: {
        businessId,
        name: nombreDeProducto(n.nombre),
        price: n.precio,
        category: limpiarTextoDeCarta(n.seccion) || 'General',
        description: limpiarTextoDeCarta(n.descripcion ?? '') || null,
        barcode: n.barcode ?? null,
        brand: n.brand ?? null,
        unit: n.unit ?? null,
        stock: n.stock ?? null,
      },
    });
    idsNuevos.push(creado.id);
    creados++;
  }

  for (const a of actualizaciones) {
    // updateMany con businessId en el where: un token no puede tocar el
    // catálogo de otro negocio ni aunque le pasen un productId ajeno.
    const res = await prisma.product.updateMany({
      where: { id: a.productId, businessId },
      data: {
        name: nombreDeProducto(a.nombre),
        price: a.precio,
        category: limpiarTextoDeCarta(a.seccion) || 'General',
        ...(a.descripcion !== undefined && {
          description: limpiarTextoDeCarta(a.descripcion) || null,
        }),
        ...(a.brand !== undefined && { brand: a.brand }),
        ...(a.unit !== undefined && { unit: a.unit }),
        ...(a.stock !== undefined && { stock: a.stock }),
      },
    });
    if (res.count > 0) actualizados++;
  }

  return { creados, actualizados, idsNuevos };
}

export async function createBusinessProduct(
  businessId: string,
  dto: CreateProductDTO,
): Promise<ProductDTO> {
  // Quita los emojis y rechaza el nombre que era SOLO un emoji: la fuente del
  // sitio no los dibuja y el plato aparecía sin nombre en la carta.
  const name = nombreDeProducto(dto.name);
  if (!(dto.price >= 0)) throw new Error('El precio debe ser un número válido.');

  // Las adiciones que el dueño marcó al crear el plato. Se ADJUNTAN tal cual
  // están en la biblioteca: no se reescriben (reescribirlas cambiaría el precio
  // del aguacate en los otros once platos que lo usan) y van en la MISMA
  // transacción que el producto — si el enlace fallara después, quedaría un
  // plato a la venta sin las adiciones que el dueño creyó haberle puesto.
  const grupos = [...new Set((dto.optionGroupIds ?? []).filter((x) => typeof x === 'string' && x))];
  if (grupos.length > 0) {
    const mios = await prisma.optionGroup.count({ where: { id: { in: grupos }, businessId } });
    // Un id de otro negocio no se enlaza: sería venderle a este cliente las
    // adiciones —y los precios— de otro local.
    if (mios !== grupos.length) throw new Error('Una de las adiciones no es de este negocio.');
  }

  const p = await prisma.product.create({
    data: {
      ...(grupos.length > 0 && {
        gruposOpciones: { create: grupos.map((groupId, sortOrder) => ({ groupId, sortOrder })) },
      }),
      businessId,
      name,
      price: dto.price,
      // Lanza con el motivo si el «antes» está al revés o es increíble.
      compareAtPrice: saneaPrecioAntes(dto.price, dto.compareAtPrice),
      // Y una fecha ya pasada se rechaza: guardarla dejaría una promoción que
      // nace muerta y el dueño creería que el portal no guardó.
      promoUntil: saneaFinDePromo(dto.promoUntil),
      description: limpiarTextoDeCarta(dto.description ?? '') || null,
      category: limpiarTextoDeCarta(dto.category ?? '') || 'General',
      imageUrl: dto.imageUrl ?? null,
      ...(dto.suggestAsAddon !== undefined && { suggestAsAddon: dto.suggestAsAddon }),
      ..._inventarioData(dto),
    },
    include: _photoInclude,
  });
  return _productToDTO(p);
}

export async function updateBusinessProduct(
  businessId: string,
  productId: string,
  dto: UpdateProductDTO,
): Promise<ProductDTO> {
  // Asegura que el producto pertenece a ESTE negocio (el token no debe editar
  // el catálogo de otro).
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
  const p = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(dto.name !== undefined && { name: nombreDeProducto(dto.name) }),
      ...(dto.promoUntil !== undefined && { promoUntil: saneaFinDePromo(dto.promoUntil) }),
      ...(dto.price !== undefined && { price: dto.price }),
      // Se valida contra el precio que va a QUEDAR, no contra el que había:
      // bajar el precio sin tocar el «antes» debe seguir siendo coherente.
      ...(dto.compareAtPrice !== undefined && {
        compareAtPrice: saneaPrecioAntes(dto.price ?? existing.price, dto.compareAtPrice),
      }),
      ...(dto.description !== undefined && { description: dto.description.trim() || null }),
      ...(dto.category !== undefined && { category: dto.category.trim() || 'General' }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.suggestAsAddon !== undefined && { suggestAsAddon: dto.suggestAsAddon }),
      ..._inventarioData(dto),
    },
    include: _photoInclude,
  });
  return _productToDTO(p);
}

export async function deleteBusinessProduct(businessId: string, productId: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
  await prisma.product.delete({ where: { id: productId } });
}

/** Actualiza la foto de portada del local y devuelve el negocio ya mapeado. */
export async function updateBusinessCover(businessId: string, imageUrl: string): Promise<Business> {
  const biz = await prisma.business.update({
    where: { id: businessId },
    data: { imageUrl },
  });
  return _dbToBusinessInterface(biz);
}

// ─── Ajustes del negocio (perfil + vitrina) ───────────────────────────────────

export interface BusinessSettingsView {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  deliveryFee: number;
  etaMinutes: number;
  acceptingOrders: boolean;
  openingHours: string;
  imageUrl?: string;
  promoMinAmount?: number;
  promoDiscount?: number;
  promoFrom?: string;
  promoUntil?: string;
  /** Horario estructurado. [] = sin horario declarado (siempre abierta). */
  hours: Franja[];
  /** Hasta cuándo está pausada, si lo está. */
  pausedUntil?: string;
  pauseReason?: string;
  /**
   * Si está recibiendo pedidos AHORA y por qué no. Es lo mismo que ve el
   * cliente: el dueño tiene que poder comprobar en su portal lo que la app
   * está enseñando de su tienda, sin abrir la app.
   */
  isOpen: boolean;
  cerradoMotivo?: string;
}

function _settingsView(b: {
  name: string; address: string; phone: string | null; whatsapp: string | null;
  deliveryFee: number; etaMinutes: number; acceptingOrders: boolean;
  openingHours: string | null; imageUrl: string | null;
  promoMinAmount?: number | null; promoDiscount?: number | null;
  promoFrom?: Date | null; promoUntil?: Date | null;
  hours?: unknown; pausedUntil?: Date | null; pauseReason?: string | null;
}): BusinessSettingsView {
  const estado = tiendaRecibiendo({
    acceptingOrders: b.acceptingOrders,
    hours: b.hours,
    pausedUntil: b.pausedUntil ?? null,
  });
  return {
    name: b.name,
    address: b.address,
    phone: b.phone ?? '',
    whatsapp: b.whatsapp ?? '',
    deliveryFee: b.deliveryFee,
    etaMinutes: b.etaMinutes,
    acceptingOrders: b.acceptingOrders,
    openingHours: b.openingHours ?? '',
    imageUrl: b.imageUrl ?? undefined,
    promoMinAmount: b.promoMinAmount ?? undefined,
    promoDiscount: b.promoDiscount ?? undefined,
    promoFrom: b.promoFrom?.toISOString(),
    promoUntil: b.promoUntil?.toISOString(),
    hours: _franjas(b.hours),
    // Una pausa vencida no se enseña: sería un aviso de algo que ya pasó.
    pausedUntil: enPausa(b.pausedUntil ?? null) ? b.pausedUntil!.toISOString() : undefined,
    pauseReason: enPausa(b.pausedUntil ?? null) ? (b.pauseReason ?? undefined) : undefined,
    isOpen: estado.abierta,
    cerradoMotivo: estado.abierta ? undefined : (estado.motivo ?? undefined),
  };
}

export async function getBusinessSettings(businessId: string): Promise<BusinessSettingsView> {
  const b = await prisma.business.findUnique({ where: { id: businessId } });
  if (!b) throw new Error('Business not found');
  return _settingsView(b);
}

export async function updateBusinessSettings(
  businessId: string,
  dto: BusinessSettingsDTO,
): Promise<BusinessSettingsView> {
  const b = await prisma.business.update({
    where: { id: businessId },
    data: {
      ...(dto.name !== undefined && dto.name.trim() ? { name: dto.name.trim() } : {}),
      ...(dto.address !== undefined && dto.address.trim() ? { address: dto.address.trim() } : {}),
      ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
      ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp.trim() || null }),
      ...(dto.deliveryFee !== undefined && Number.isFinite(dto.deliveryFee) && dto.deliveryFee >= 0
        ? { deliveryFee: Math.round(dto.deliveryFee) }
        : {}),
      ...(dto.etaMinutes !== undefined && Number.isFinite(dto.etaMinutes) && dto.etaMinutes > 0
        ? { etaMinutes: Math.round(dto.etaMinutes) }
        : {}),
      ...(dto.acceptingOrders !== undefined && { acceptingOrders: dto.acceptingOrders }),
      ...(dto.openingHours !== undefined && { openingHours: dto.openingHours.trim() || null }),
      // El horario estructurado. `saneaHorario` lanza con el día y el motivo:
      // guardar una franja rota dejaría la tienda cerrada sin que el dueño
      // pueda saber por qué.
      ...(dto.hours !== undefined && {
        hours: saneaHorario(dto.hours) as unknown as Prisma.InputJsonValue,
      }),
      // La pausa se guarda como el INSTANTE en que termina, no como minutos:
      // así se levanta sola sin que nadie tenga que acordarse de nada.
      ...(dto.pauseMinutes !== undefined
        ? (() => {
            const hasta = saneaPausa(dto.pauseMinutes);
            return {
              pausedUntil: hasta,
              pauseReason: hasta ? (dto.pauseReason?.trim() || null) : null,
            };
          })()
        : {}),
      // Las dos juntas o ninguna: `saneaPromoTienda` lanza si llega media.
      // Se renombran a mano a propósito: un spread NO pasa por el control de
      // propiedades sobrantes de TypeScript, así que las claves en español se
      // colaban hasta Prisma sin que el compilador dijera nada.
      ...(dto.promoMinAmount !== undefined || dto.promoDiscount !== undefined
        ? (() => {
            const p = saneaPromoTienda(dto.promoMinAmount, dto.promoDiscount);
            const v = saneaVigencia(dto.promoFrom, dto.promoUntil);
            // Al quitar la promoción se van también sus fechas: dejarlas sería
            // dejar una vigencia huérfana que reviviría la siguiente promoción
            // ya vencida.
            const sinPromo = p.minimo === null;
            return {
              promoMinAmount: p.minimo,
              promoDiscount: p.descuento,
              promoFrom: sinPromo ? null : v.desde,
              promoUntil: sinPromo ? null : v.hasta,
            };
          })()
        : {}),
    },
  });
  return _settingsView(b);
}

// ─── Calificaciones que recibe el negocio ─────────────────────────────────────

export interface BusinessReviewsView {
  /** Promedio, o null si todavía nadie lo ha calificado. */
  rating: number | null;
  ratingCount: number;
  /** Cuántos pusieron 5, 4, 3… para ver de dónde sale el promedio. */
  distribucion: Record<number, number>;
  comentarios: Array<{
    estrellas: number;
    comentario: string;
    fecha: string;
    /**
     * De dónde viene la queja: `salon` o `domicilio`.
     *
     * Sin esto, el dueño lee «dos estrellas, llegó frío» y no sabe si el
     * problema fue su cocina o el repartidor — y son dos cosas que arregla de
     * formas opuestas. El dato existía en el pedido y no se le estaba dando.
     */
    origen: 'salon' | 'domicilio';
  }>;
}

/**
 * Lo que la gente ha dicho de este local.
 *
 * Se le enseña al dueño porque una nota sin los comentarios es un castigo sin
 * explicación: sabe que bajó a 3,8 y no sabe si es por la comida, por la
 * demora o por un pedido que salió mal una noche.
 */
export async function getBusinessReviews(businessId: string): Promise<BusinessReviewsView> {
  const filas = await prisma.order.findMany({
    where: { businessId, rating: { not: null } },
    select: { rating: true, ratingComment: true, updatedAt: true, mode: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  const distribucion: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of filas) {
    const n = f.rating as number;
    if (n >= 1 && n <= 5) distribucion[n] = (distribucion[n] ?? 0) + 1;
  }

  const { rating, ratingCount } = promedioReputacion(filas.map((f) => f.rating as number));
  return {
    rating,
    ratingCount,
    distribucion,
    comentarios: filas
      .filter((f) => f.ratingComment)
      .slice(0, 30)
      .map((f) => ({
        estrellas: f.rating as number,
        comentario: f.ratingComment as string,
        fecha: f.updatedAt.toISOString(),
        // Lo que no se reparte se consumió o se recogió EN el local, así
        // que cuenta como salón. Con `=== 'DINE_IN'`, un «para llevar»
        // aparecería como domicilio y falsearía de qué lado viene la
        // calificación.
        origen: (seDespacha(f.mode) ? 'domicilio' : 'salon') as 'salon' | 'domicilio',
      })),
  };
}

// ─── Estadísticas de ventas ───────────────────────────────────────────────────

export async function getBusinessStats(
  businessId: string,
  fromISO?: string,
  toISO?: string,
): Promise<BusinessStatsDTO> {
  // Rango por defecto: hoy (00:00 → ahora).
  const from = fromISO ? new Date(fromISO) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = toISO ? new Date(toISO) : new Date();

  const orders = await prisma.order.findMany({
    where: { businessId, createdAt: { gte: from, lte: to } },
    include: { lines: true },
  });

  let deliveredCount = 0;
  let cancelledCount = 0;
  let inProgressCount = 0;
  let revenue = 0;
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const o of orders) {
    if (o.status === 'CANCELLED') {
      cancelledCount++;
      continue;
    }
    if (o.status === 'DELIVERED') deliveredCount++;
    else inProgressCount++;
    revenue += o.subtotal;
    for (const l of o.lines) {
      const key = l.productName;
      const agg = productMap.get(key) ?? { name: key, quantity: 0, revenue: 0 };
      agg.quantity += l.quantity;
      agg.revenue += l.subtotal;
      productMap.set(key, agg);
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ordersCount: orders.length,
    deliveredCount,
    cancelledCount,
    inProgressCount,
    revenue,
    topProducts,
  };
}

/**
 * La identidad del local, tal como viaja al cliente.
 *
 * UN SOLO SITIO lo decide porque hay TRES mappers que construyen un
 * `BusinessPublicDTO` —la lista, el detalle y la carta del QR— y lo que se
 * copia en tres sitios se separa en cuanto alguien toca uno. Pasó con el
 * formateador de moneda, que acabó en diecisiete copias y dos formatos.
 *
 * La ausencia es informativa y por eso va `undefined` y no una cadena vacía:
 * la pantalla distingue «no declaró logo» de «logo vacío» y dibuja la inicial
 * del local en vez de un hueco.
 */
export function marcaDelLocal(b: {
  logoUrl?: string | null; tagline?: string | null;
  gallery?: unknown; brandColor?: string | null;
}): Pick<BusinessPublicDTO, 'logoUrl' | 'tagline' | 'gallery' | 'marca'> {
  const fotos = Array.isArray(b.gallery)
    ? (b.gallery as unknown[])
        .map((f) => (typeof f === 'string' ? f : (f as { url?: unknown })?.url))
        .filter((u): u is string => typeof u === 'string' && u.length > 0)
        .slice(0, MAX_FOTOS_LOCAL)
    : [];
  // Se sanea AL SALIR además de al guardar: una fila vieja o escrita a mano no
  // puede meter en el atributo `style` de la carta algo que no sea un color.
  // Y si no hay color propio NO se manda la paleta: la ausencia es lo que le
  // dice a la carta que use la de ZIPA, en vez de recibir un verde que
  // parecería una elección del local.
  const p = paletaDeLocal(b.brandColor);
  return {
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    ...(b.tagline ? { tagline: b.tagline } : {}),
    ...(fotos.length ? { gallery: fotos } : {}),
    ...(p.propia ? { marca: { color: p.marca, sobre: p.sobreMarca, suave: p.suave } } : {}),
  };
}

export async function getAllBusinessesPublic(): Promise<BusinessPublicDTO[]> {
  const businesses = await prisma.business.findMany({
    where: { isOpen: true },
    include: {
      products: {
        where: { isAvailable: true },
        // La carta se lee en un orden concreto: entradas antes que postres.
        // Por fecha de creación salían mezcladas.
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: _photoInclude,
      },
    },
    orderBy: { name: 'asc' },
  });
  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    category: categoriaDesdeBD(b.category),
    address: b.address,
    rating: b.ratingCount > 0 ? b.rating : null,
    ratingCount: b.ratingCount,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    // "Abierto" para el cliente = la vitrina está recibiendo pedidos.
    ..._estadoVitrina(b),
    imageUrl: b.imageUrl ?? undefined,
    ...marcaDelLocal(b),
    products: b.products.map(_productToDTO),
  }));
}

export async function getBusinessPublicById(id: string): Promise<BusinessPublicDTO> {
  const b = await prisma.business.findUnique({
    where: { id },
    include: {
      products: {
        where: { isAvailable: true },
        // La carta se lee en un orden concreto: entradas antes que postres.
        // Por fecha de creación salían mezcladas.
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: _photoInclude,
      },
    },
  });
  if (!b) throw new Error(`Business ${id} not found`);
  return {
    id: b.id,
    name: b.name,
    category: categoriaDesdeBD(b.category),
    address: b.address,
    rating: b.ratingCount > 0 ? b.rating : null,
    ratingCount: b.ratingCount,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    ..._estadoVitrina(b),
    imageUrl: b.imageUrl ?? undefined,
    citySlug: b.citySlug,
    shipsTo: destinosDesdeBD(b.shipsTo),
    ...marcaDelLocal(b),
    products: await _conMasPedido(b.id, b.products.map(_productToDTO)),
  };
}

// ─── Recuperación del enlace del portal ───────────────────────────────────────

export interface BusinessLinkDTO {
  id: string;
  name: string;
  token: string;
  category: string;
  isOpen: boolean;
}

/**
 * Negocios asociados a un teléfono, para recuperar el enlace del portal.
 *
 * El portal es un enlace mágico sin contraseña: si el dueño lo pierde, hoy se
 * queda por fuera para siempre. Esta búsqueda es la puerta de vuelta.
 *
 * No puede ser una igualdad simple: el teléfono se guarda tal como lo escribió
 * el dueño al registrarse ("300 111 2233", "+573001112233", "3001112233"). Se
 * filtran candidatos por los últimos 4 dígitos —contiguos en cualquiera de esos
 * formatos— y recién ahí se comparan ya normalizados. Así también funciona con
 * los negocios que ya estaban registrados antes de esta función.
 */
export async function findBusinessesByPhone(rawPhone: string): Promise<BusinessLinkDTO[]> {
  const normalizado = normalizeColombianPhone(rawPhone);
  const ultimos4 = normalizado.slice(-4);
  if (!/^\d{4}$/.test(ultimos4)) return [];

  const candidatos = await prisma.business.findMany({
    where: {
      OR: [{ phone: { endsWith: ultimos4 } }, { whatsapp: { endsWith: ultimos4 } }],
    },
    select: {
      id: true, name: true, token: true, category: true, isOpen: true,
      phone: true, whatsapp: true,
    },
    take: 200,
  });

  return candidatos
    .filter(
      (b) =>
        (b.phone != null && normalizeColombianPhone(b.phone) === normalizado) ||
        (b.whatsapp != null && normalizeColombianPhone(b.whatsapp) === normalizado),
    )
    .map((b) => ({
      id: b.id,
      name: b.name,
      token: b.token,
      category: String(b.category),
      isOpen: b.isOpen,
    }));
}

/**
 * Fija a mano el punto del negocio en el mapa.
 *
 * Los negocios registrados antes de la geocodificación automática no tienen
 * coordenadas, y hay direcciones que Google no resuelve. Sin esta vía, esos
 * negocios se quedarían para siempre anclados al centro del pueblo.
 */
export async function updateBusinessLocation(
  businessId: string,
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Coordenadas inválidas.');
  }
  // Mover el punto mueve la plaza: es la única vía por la que un comercio ya
  // registrado consigue ciudad, porque al registrarse puede que la dirección no
  // se resolviera (sin llave de Google, o escrita de forma rara).
  const citySlug = await plazaDeCoordenadas(lat, lng);
  await prisma.business.update({
    where: { id: businessId },
    data: { lat, lng, citySlug },
  });
  return { lat, lng };
}

/**
 * Declara a qué otras ciudades despacha el comercio, a qué precio y en cuánto.
 *
 * Se valida contra `municipalities`: un destino que no existe o está inactivo se
 * rechaza aquí y no cuando un cliente intente comprar. El resto de reglas —el
 * auto-destino, el cero de más, la ciudad repetida— vive en `lib/destinos-envio`
 * con sus pruebas.
 */
export async function updateBusinessShipping(
  businessId: string,
  destinosCrudos: unknown,
): Promise<DestinoEnvio[]> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { citySlug: true },
  });
  if (!biz) throw new Error('El negocio no existe.');

  const destinos = saneaDestinos(destinosCrudos, biz.citySlug);

  if (destinos.length > 0) {
    const encontrados = await prisma.municipality.findMany({
      where: { slug: { in: destinos.map((d) => d.city) }, isActive: true },
      select: { slug: true },
    });
    const validos = new Set(encontrados.map((m) => m.slug));
    const faltan = destinos.filter((d) => !validos.has(d.city)).map((d) => d.city);
    if (faltan.length > 0) {
      throw new Error(
        `No conocemos estos municipios: ${faltan.join(', ')}. ` +
          'Elígelos del buscador para que queden bien escritos.',
      );
    }
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { shipsTo: destinos as unknown as Prisma.InputJsonValue },
  });
  return destinos;
}

// ─── La identidad del local en su carta ───────────────────────────────────────

/** El logo del local. Reemplaza al anterior; `null` lo quita. */
export async function updateBusinessLogo(
  businessId: string, logoUrl: string | null,
): Promise<{ logoUrl: string | null }> {
  const b = await prisma.business.update({
    where: { id: businessId }, data: { logoUrl },
    select: { logoUrl: true },
  });
  return b;
}

/**
 * Añade una foto del LOCAL a la galería (el salón, la parrilla, la terraza).
 *
 * Se añade al final en vez de reemplazar porque el dueño las sube de una en
 * una desde el teléfono, y pasado el tope se RECHAZA diciéndolo en vez de
 * tirar la más antigua en silencio: la que se perdería es la que él acaba de
 * decidir que quiere, y no se enteraría.
 */
export async function addFotoDelLocal(
  businessId: string, url: string,
): Promise<{ gallery: string[] }> {
  const actual = await prisma.business.findUnique({
    where: { id: businessId }, select: { gallery: true },
  });
  const fotos = marcaDelLocal({ gallery: actual?.gallery }).gallery ?? [];
  if (fotos.length >= MAX_FOTOS_LOCAL) {
    throw new Error(
      `Ya tienes ${MAX_FOTOS_LOCAL} fotos del local, que es el máximo. `
      + 'Quita alguna antes de subir otra.',
    );
  }
  const siguiente = [...fotos, url];
  await prisma.business.update({
    where: { id: businessId }, data: { gallery: siguiente },
  });
  return { gallery: siguiente };
}

/** Quita una foto del local por su URL. */
export async function quitarFotoDelLocal(
  businessId: string, url: string,
): Promise<{ gallery: string[] }> {
  const actual = await prisma.business.findUnique({
    where: { id: businessId }, select: { gallery: true },
  });
  const siguiente = (marcaDelLocal({ gallery: actual?.gallery }).gallery ?? [])
    .filter((f) => f !== url);
  await prisma.business.update({
    where: { id: businessId }, data: { gallery: siguiente },
  });
  return { gallery: siguiente };
}

/**
 * El color de marca y la frase del local.
 *
 * El color se sanea aquí y se guarda `null` si no es un color: guardar
 * «granate» dejaría la carta pintando un `style` que el navegador ignora, y
 * el dueño vería su carta en verde sin saber por qué.
 *
 * La frase se limpia como el nombre de un plato —los emojis no se dibujan
 * igual en todos los teléfonos— y se corta, porque lo que no cabe en dos
 * renglones sale con puntos suspensivos, que es peor que no escribirla.
 */
export async function updateMarcaDelLocal(
  businessId: string,
  dto: { brandColor?: string | null; tagline?: string | null },
): Promise<{ brandColor: string | null; tagline: string | null }> {
  const data: { brandColor?: string | null; tagline?: string | null } = {};
  if (dto.brandColor !== undefined) {
    data.brandColor = saneaColorMarca(dto.brandColor);
    if (dto.brandColor && !data.brandColor) {
      throw new Error('El color debe ir en formato #RRGGBB, por ejemplo #E11D48.');
    }
  }
  if (dto.tagline !== undefined) {
    const limpia = limpiarTextoDeCarta(dto.tagline ?? '').slice(0, LARGO_FRASE);
    data.tagline = limpia || null;
  }
  const b = await prisma.business.update({
    where: { id: businessId }, data,
    select: { brandColor: true, tagline: true },
  });
  return b;
}

/**
 * Lo que el negocio vendió en un período, con su detalle.
 *
 * Es lo que pedían los dueños —«toda la facturación de lo que se pide»— y lo
 * que el portal no tenía: solo había el panel de HOY, así que no se podía
 * cerrar una semana ni un mes. NO es una factura electrónica (ver
 * `reporte-ventas.ts`): es el reporte con el que se cuadra la caja.
 *
 * Se consulta por `createdAt` y no por `deliveredAt` porque es la fecha que el
 * dueño reconoce —cuándo le pidieron— y es la que ya usa su panel del día; un
 * pedido tomado a las 11 de la noche y entregado a medianoche cambiaría de día
 * entre las dos pantallas.
 */
export async function getSalesReportForBusiness(
  businessId: string,
  from?: string,
  to?: string,
): Promise<ReporteVentas> {
  // La ventana se calcula en hora de COLOMBIA, no con `rangoFechas`: aquél
  // toma «2026-06-10» como medianoche UTC —las 7 de la tarde del 9 aquí—, y
  // entonces la consulta cortaba el día a las 6:59 p. m. y la venta de la noche
  // caía en el día siguiente. La consulta y el agrupamiento parten el día en el
  // mismo instante o el total no cuadra con la suma de los días.
  const rango = ventanaColombiana(from, to);
  const pedidos = await prisma.order.findMany({
    where: {
      businessId,
      status: 'DELIVERED',
      ...(rango.gte || rango.lte ? { createdAt: rango } : {}),
    },
    select: {
      orderRef: true, createdAt: true, mode: true, status: true,
      subtotal: true, promoDiscount: true, deliveryFee: true, intercityFee: true,
      tipAmount: true, paymentMethod: true,
      lines: { select: { productName: true, quantity: true, unitPrice: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return reporteDeVentas(
    pedidos.map((p) => ({
      ref: p.orderRef,
      fecha: p.createdAt,
      mode: p.mode,
      status: p.status,
      subtotal: p.subtotal,
      promoDiscount: p.promoDiscount,
      deliveryFee: p.deliveryFee,
      intercityFee: p.intercityFee,
      tipAmount: p.tipAmount,
      paymentMethod: p.paymentMethod,
      lines: p.lines.map((l) => ({
        nombre: l.productName, quantity: l.quantity, unitPrice: l.unitPrice,
      })),
    })),
    rango.gte,
    rango.lte,
  );
}

// ── Arreglar los nombres que ya están cargados con los ingredientes dentro ──
//
// `separarDescripcion` arregla lo que entra por la foto DE AHORA EN ADELANTE,
// pero los catálogos que ya se subieron tienen el plato y sus ingredientes en
// el mismo campo. Un `UPDATE` masivo está descartado: son nombres de platos de
// un negocio real y la regla, por buena que sea, se puede equivocar en un
// renglón raro. Así que esto PROPONE y el dueño confirma, igual que la vista
// previa obligatoria del CSV.

export interface PropuestaNombre {
  productId: string;
  antes: string;
  nombre: string;
  descripcion: string;
}

/** Los productos cuyo nombre se puede partir, sin tocar nada. */
export async function proponerSeparacionDeNombres(
  businessId: string,
): Promise<PropuestaNombre[]> {
  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, name: true, description: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const propuestas: PropuestaNombre[] = [];
  for (const p of products) {
    const r = separarDescripcion(p.name);
    if (!r.descripcion) continue;
    // Una descripción que el dueño ya escribió MANDA: machacarla perdería lo
    // que él redactó a mano para quedarnos con lo que dedujo una regla.
    if ((p.description ?? '').trim()) continue;
    propuestas.push({
      productId: p.id,
      antes: p.name,
      nombre: r.nombre,
      descripcion: r.descripcion,
    });
  }
  return propuestas;
}

/**
 * Aplica solo los productos que el dueño confirmó.
 *
 * Se vuelve a calcular la separación en el servidor en vez de escribir lo que
 * mande el portal: así el nombre nuevo sale siempre de la misma regla y nadie
 * puede colar un nombre arbitrario por esta puerta.
 */
export async function aplicarSeparacionDeNombres(
  businessId: string,
  productIds: string[],
): Promise<{ aplicados: number }> {
  const propuestas = await proponerSeparacionDeNombres(businessId);
  const pedidos = new Set(productIds);
  const aplicables = propuestas.filter((p) => pedidos.has(p.productId));

  for (const p of aplicables) {
    // El `businessId` en el `where` es la comprobación de pertenencia: un id
    // de otro negocio no escribe ninguna fila en vez de lanzar a medias.
    await prisma.product.updateMany({
      where: { id: p.productId, businessId },
      data: { name: p.nombre, description: p.descripcion },
    });
  }
  return { aplicados: aplicables.length };
}
