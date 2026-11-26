// Campañas de temporada: «Burger Show», «Pizza Fest», «Día de la madre».
//
// QUÉ RESUELVE. Un evento como el Burger Show consiste en que los locales
// sacan productos ESPECIALES solo para esos días. Sin esto el dueño tendría
// que crear la hamburguesa el primer día y acordarse de borrarla el último —
// nadie se acuerda, y en marzo seguiría vendiéndose «la del Burger Show»—.
//
// LA VIGENCIA SE DERIVA, NO SE GUARDA. No hay un barrido que encienda o apague
// productos: con las fechas de la campaña, cada consulta decide si el producto
// existe AHORA. Un estado guardado y unas fechas guardadas acaban discrepando
// y nadie sabe cuál miente (la misma lección del precio de las promociones).
//
// UNA SOLA REGLA para la carta, la sección de la campaña y la caja. Si la
// pantalla y el cobro lo decidieran por separado, el cliente vería la
// hamburguesa especial y al pagar le dirían que no existe — o al revés,
// compraría el 10 de diciembre algo que ya nadie está cocinando.

/** Lo mínimo de una campaña para decidir si rige. */
export interface CampanaFechas {
  active: boolean;
  startsAt: Date;
  endsAt: Date;
}

export type EstadoCampana = 'proxima' | 'vigente' | 'terminada' | 'apagada';

export function estadoCampana(c: CampanaFechas, ahora: Date = new Date()): EstadoCampana {
  if (!c.active) return 'apagada';
  const t = ahora.getTime();
  if (t < c.startsAt.getTime()) return 'proxima';
  if (t > c.endsAt.getTime()) return 'terminada';
  return 'vigente';
}

export function campanaVigente(c: CampanaFechas, ahora: Date = new Date()): boolean {
  return estadoCampana(c, ahora) === 'vigente';
}

/**
 * ¿Se le enseña (y se le vende) este producto al cliente ahora?
 *
 * - Sin campaña: siempre (es como están todos los productos de antes).
 * - Inscrito pero NO exclusivo: siempre; la campaña solo lo destaca.
 * - Exclusivo de la campaña: solo mientras la campaña rige.
 */
export function productoVisible(
  p: { campaignOnly: boolean; campaign: CampanaFechas | null },
  ahora: Date = new Date(),
): boolean {
  if (!p.campaign || !p.campaignOnly) return true;
  return campanaVigente(p.campaign, ahora);
}

/**
 * El mismo criterio de `productoVisible` escrito como filtro de Prisma, para
 * las consultas de la carta. Va aquí, al lado de la regla, para que las dos
 * formas no se separen.
 */
export function filtroProductosVisibles(ahora: Date = new Date()) {
  return {
    OR: [
      { campaignId: null },
      { campaignOnly: false },
      { campaign: { active: true, startsAt: { lte: ahora }, endsAt: { gte: ahora } } },
    ],
  };
}

// ─── Fechas: el día se corta en hora de Colombia ─────────────────────────────
//
// «Del 27 al 3 de diciembre» quiere decir desde las 00:00 del 27 hasta las
// 23:59 del 3 EN PAMPLONA. Tomar la fecha como UTC abriría la campaña a las
// 7 de la noche del 26 y la cerraría a las 7 de la noche del 3, justo a la
// hora en que más se piden hamburguesas.

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function fechaValida(s: string): boolean {
  const m = FECHA.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 00:00:00 de ese día en Colombia (UTC−5, sin horario de verano). */
export function inicioDelDiaColombia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000-05:00`);
}

/** 23:59:59.999 de ese día en Colombia. */
export function finDelDiaColombia(fecha: string): Date {
  return new Date(`${fecha}T23:59:59.999-05:00`);
}

/** La fecha (YYYY-MM-DD) que ese instante tiene en Colombia. */
export function fechaColombia(d: Date): string {
  return new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

// ─── Saneo de lo que escribe el admin ────────────────────────────────────────

export class CampanaError extends Error {}

/** Una campaña dura días o semanas; más de dos meses es casi seguro un error
 *  de año en la fecha, y dejaría productos especiales a la venta todo el año. */
export const MAX_DIAS_CAMPANA = 62;

const COLOR = /^#[0-9a-fA-F]{6}$/;
const ICONO = /^[a-z0-9-]{2,30}$/;

export interface CampanaEntrada {
  title?: unknown;
  subtitle?: unknown;
  citySlug?: unknown;
  desde?: unknown;
  hasta?: unknown;
  icon?: unknown;
  color?: unknown;
  active?: unknown;
}

export interface CampanaSaneada {
  title: string;
  subtitle: string | null;
  citySlug: string | null;
  startsAt: Date;
  endsAt: Date;
  icon: string | null;
  color: string | null;
  active: boolean;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Valida lo que llega del panel. Lanza `CampanaError` con un motivo que el
 * admin pueda corregir sin adivinar.
 */
export function saneaCampana(e: CampanaEntrada): CampanaSaneada {
  const title = texto(e.title);
  if (title.length < 3) throw new CampanaError('Ponle un nombre a la campaña (mínimo 3 letras).');
  if (title.length > 40) throw new CampanaError('El nombre es muy largo: máximo 40 letras.');

  const subtitle = texto(e.subtitle);
  if (subtitle.length > 90) throw new CampanaError('La frase es muy larga: máximo 90 letras.');

  const desde = texto(e.desde);
  const hasta = texto(e.hasta);
  if (!fechaValida(desde)) throw new CampanaError('La fecha de inicio no se entiende (usa AAAA-MM-DD).');
  if (!fechaValida(hasta)) throw new CampanaError('La fecha de fin no se entiende (usa AAAA-MM-DD).');
  const startsAt = inicioDelDiaColombia(desde);
  const endsAt = finDelDiaColombia(hasta);
  if (endsAt.getTime() < startsAt.getTime()) {
    throw new CampanaError('La campaña terminaría antes de empezar: revisa las fechas.');
  }
  const dias = (endsAt.getTime() - startsAt.getTime()) / 86_400_000;
  if (dias > MAX_DIAS_CAMPANA) {
    throw new CampanaError(`Una campaña no puede durar más de ${MAX_DIAS_CAMPANA} días.`);
  }

  const ciudad = texto(e.citySlug).toLowerCase();
  const icon = texto(e.icon).toLowerCase();
  if (icon && !ICONO.test(icon)) throw new CampanaError('El dibujo elegido no existe.');
  const color = texto(e.color);
  if (color && !COLOR.test(color)) throw new CampanaError('El color debe ser como #E53935.');

  return {
    title,
    subtitle: subtitle || null,
    citySlug: ciudad || null,
    startsAt,
    endsAt,
    icon: icon || null,
    color: color ? color.toUpperCase() : null,
    active: e.active === undefined ? true : e.active === true,
  };
}

// ─── Orden de la sección en la app ───────────────────────────────────────────

export interface ItemDeCampana {
  /** El local está recibiendo pedidos ahora. */
  recibiendo: boolean;
  /** Descuento en porcentaje, si el producto está en promoción. */
  descuentoPct?: number | undefined;
  precio: number;
  nombre: string;
}

/**
 * Primero lo que se puede pedir YA (un local cerrado arriba es un anuncio que
 * no se puede comprar), luego lo que tiene promoción (de mayor a menor
 * descuento), y después por precio. El nombre desempata para que el orden no
 * baile entre aperturas.
 */
export function ordenarItemsDeCampana<T extends ItemDeCampana>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.recibiendo !== b.recibiendo) return a.recibiendo ? -1 : 1;
    const da = a.descuentoPct ?? 0;
    const db = b.descuentoPct ?? 0;
    if (da !== db) return db - da;
    if (a.precio !== b.precio) return a.precio - b.precio;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
