import { randomBytes } from 'crypto';
import { PromoScope, PromoType } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Promociones: cupones de descuento y programa de referidos.
//
// Diseño MVP honesto: el descuento se valida y canjea en el backend (auditoría
// en promo_redemptions, límites por usuario y globales), y la app aplica el
// monto descontado al total que muestra/cobra. La integración profunda con el
// ledger llegará cuando exista billetera real.
//
// Referidos: cada usuario tiene un código (NX-XXXXXX). Un usuario nuevo lo
// canjea una sola vez y AMBOS reciben un cupón personal de bienvenida.
// ─────────────────────────────────────────────────────────────────────────────

/** Valor del cupón que reciben referidor y referido (COP, descuento fijo). */
const REFERRAL_REWARD_COP = parseInt(process.env['REFERRAL_REWARD_COP'] ?? '4000', 10);
/** Vigencia de los cupones de referido (días). */
const REFERRAL_REWARD_TTL_DAYS = 30;

export class PromoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoError';
  }
}

export type PromoContext = 'trip' | 'order';

// ─── Referidos ────────────────────────────────────────────────────────────────

function _generateCode(prefix: string): string {
  // Sin 0/O/1/I para que sea fácil de dictar.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i]! % alphabet.length];
  return `${prefix}-${suffix}`;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) throw new PromoError('Usuario no encontrado');
  if (user.referralCode) return user.referralCode;

  // Reintenta ante la (improbable) colisión del índice único.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = _generateCode('NX');
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return updated.referralCode!;
    } catch {
      continue;
    }
  }
  throw new PromoError('No se pudo generar el código de referido');
}

async function _grantPersonalCoupon(userId: string, description: string): Promise<void> {
  const expiresAt = new Date(Date.now() + REFERRAL_REWARD_TTL_DAYS * 24 * 60 * 60 * 1000);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.promoCode.create({
        data: {
          code: _generateCode('REGALO'),
          description,
          type: PromoType.FIXED,
          value: REFERRAL_REWARD_COP,
          scope: PromoScope.ALL,
          perUserLimit: 1,
          maxRedemptions: 1,
          expiresAt,
          createdBy: 'referral',
          ownerUserId: userId,
        },
      });
      return;
    } catch {
      continue;
    }
  }
  throw new PromoError('No se pudo crear el cupón de referido');
}

/**
 * Canjea un código de referido. Solo usuarios que no hayan sido referidos
 * antes y que no se refieran a sí mismos. Premia a ambos con un cupón personal.
 */
export async function redeemReferral(
  userId: string,
  rawCode: string,
): Promise<{ rewardCop: number }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new PromoError('Ingresa un código');

  const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
  if (!referrer) throw new PromoError('Código de referido no válido');
  if (referrer.id === userId) throw new PromoError('No puedes usar tu propio código');

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) throw new PromoError('Usuario no encontrado');
  if (me.referredById) throw new PromoError('Ya canjeaste un código de referido');

  await prisma.user.update({ where: { id: userId }, data: { referredById: referrer.id } });
  await _grantPersonalCoupon(userId, 'Bienvenida por referido');
  await _grantPersonalCoupon(referrer.id, `Premio por invitar a ${me.name ?? 'un amigo'}`);

  return { rewardCop: REFERRAL_REWARD_COP };
}

// ─── Cupones ─────────────────────────────────────────────────────────────────

export interface PromoQuote {
  code: string;
  description: string | null;
  discount: number;
  amountAfter: number;
}

function _computeDiscount(
  promo: { type: PromoType; value: number; maxDiscount: number | null },
  amount: number,
): number {
  const raw = promo.type === PromoType.PERCENT
    ? amount * (Math.min(promo.value, 100) / 100)
    : promo.value;
  const capped = promo.maxDiscount != null ? Math.min(raw, promo.maxDiscount) : raw;
  // Nunca descontar más que el total; redondeo a peso.
  return Math.round(Math.min(capped, amount));
}

async function _findValidPromo(
  userId: string,
  rawCode: string,
  amount: number,
  context: PromoContext,
) {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new PromoError('Ingresa un código');

  const promo = await prisma.promoCode.findUnique({
    where: { code },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!promo || !promo.active) throw new PromoError('Código no válido');
  if (promo.expiresAt && promo.expiresAt < new Date()) throw new PromoError('Este código ya venció');
  if (promo.ownerUserId && promo.ownerUserId !== userId) throw new PromoError('Código no válido');
  if (promo.scope !== PromoScope.ALL) {
    const needed = context === 'trip' ? PromoScope.TRIPS : PromoScope.ORDERS;
    if (promo.scope !== needed) {
      throw new PromoError(context === 'trip'
        ? 'Este código solo aplica para pedidos'
        : 'Este código solo aplica para viajes');
    }
  }
  if (amount < promo.minAmount) {
    throw new PromoError(`Monto mínimo: $${promo.minAmount.toLocaleString('es-CO')}`);
  }
  if (promo.maxRedemptions != null && promo._count.redemptions >= promo.maxRedemptions) {
    throw new PromoError('Este código alcanzó su límite de usos');
  }
  const myUses = await prisma.promoRedemption.count({
    where: { promoCodeId: promo.id, userId },
  });
  if (myUses >= promo.perUserLimit) throw new PromoError('Ya usaste este código');

  return promo;
}

/** Valida un código sin canjearlo (para previsualizar el descuento en la app). */
export async function validatePromo(
  userId: string,
  code: string,
  amount: number,
  context: PromoContext,
): Promise<PromoQuote> {
  const promo = await _findValidPromo(userId, code, amount, context);
  const discount = _computeDiscount(promo, amount);
  return {
    code: promo.code,
    description: promo.description,
    discount,
    amountAfter: Math.max(0, Math.round(amount - discount)),
  };
}

/**
 * Canjea el código: registra la redención (auditable) y devuelve el descuento.
 * El conteo por usuario y global se revalida dentro de la transacción para
 * evitar dobles canjes concurrentes.
 */
export async function redeemPromo(
  userId: string,
  code: string,
  amount: number,
  context: PromoContext,
): Promise<PromoQuote> {
  return prisma.$transaction(async (tx) => {
    const normalized = code.trim().toUpperCase();
    const promo = await tx.promoCode.findUnique({
      where: { code: normalized },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!promo || !promo.active) throw new PromoError('Código no válido');
    if (promo.expiresAt && promo.expiresAt < new Date()) throw new PromoError('Este código ya venció');
    if (promo.ownerUserId && promo.ownerUserId !== userId) throw new PromoError('Código no válido');
    if (promo.maxRedemptions != null && promo._count.redemptions >= promo.maxRedemptions) {
      throw new PromoError('Este código alcanzó su límite de usos');
    }
    if (amount < promo.minAmount) {
      throw new PromoError(`Monto mínimo: $${promo.minAmount.toLocaleString('es-CO')}`);
    }
    const myUses = await tx.promoRedemption.count({
      where: { promoCodeId: promo.id, userId },
    });
    if (myUses >= promo.perUserLimit) throw new PromoError('Ya usaste este código');

    const discount = _computeDiscount(promo, amount);
    await tx.promoRedemption.create({
      data: { promoCodeId: promo.id, userId, context, amountBefore: amount, discount },
    });

    return {
      code: promo.code,
      description: promo.description,
      discount,
      amountAfter: Math.max(0, Math.round(amount - discount)),
    };
  });
}

// ─── Vista del cliente ────────────────────────────────────────────────────────

export interface ClientPromoOverview {
  referralCode: string;
  referralRewardCop: number;
  alreadyReferred: boolean;
  coupons: Array<{
    code: string;
    description: string | null;
    type: string;
    value: number;
    expiresAt: string | null;
  }>;
}

export async function getClientPromoOverview(userId: string): Promise<ClientPromoOverview> {
  const referralCode = await getOrCreateReferralCode(userId);
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });

  // Cupones personales vigentes y aún no usados por este usuario.
  const personal = await prisma.promoCode.findMany({
    where: {
      ownerUserId: userId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    include: { redemptions: { where: { userId } } },
    orderBy: { createdAt: 'desc' },
  });

  return {
    referralCode,
    referralRewardCop: REFERRAL_REWARD_COP,
    alreadyReferred: Boolean(me?.referredById),
    coupons: personal
      .filter((p) => p.redemptions.length < p.perUserLimit)
      .map((p) => ({
        code: p.code,
        description: p.description,
        type: p.type,
        value: p.value,
        expiresAt: p.expiresAt?.toISOString() ?? null,
      })),
  };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function adminCreatePromo(params: {
  code: string;
  description?: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  scope?: 'ALL' | 'TRIPS' | 'ORDERS';
  minAmount?: number;
  maxDiscount?: number;
  maxRedemptions?: number;
  perUserLimit?: number;
  expiresAt?: string;
  createdBy: string;
}) {
  const code = params.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    throw new PromoError('El código debe tener 3–24 caracteres (letras, números, guiones)');
  }
  if (params.type === 'PERCENT' && (params.value <= 0 || params.value > 100)) {
    throw new PromoError('Porcentaje inválido (1–100)');
  }
  if (params.type === 'FIXED' && params.value <= 0) {
    throw new PromoError('El monto debe ser mayor que 0');
  }
  try {
    return await prisma.promoCode.create({
      data: {
        code,
        description: params.description ?? null,
        type: params.type === 'PERCENT' ? PromoType.PERCENT : PromoType.FIXED,
        value: params.value,
        scope: params.scope === 'TRIPS' ? PromoScope.TRIPS
          : params.scope === 'ORDERS' ? PromoScope.ORDERS
          : PromoScope.ALL,
        minAmount: params.minAmount ?? 0,
        maxDiscount: params.maxDiscount ?? null,
        maxRedemptions: params.maxRedemptions ?? null,
        perUserLimit: params.perUserLimit ?? 1,
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
        createdBy: params.createdBy,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      throw new PromoError('Ya existe un código con ese nombre');
    }
    throw err;
  }
}

export async function adminListPromos() {
  const promos = await prisma.promoCode.findMany({
    where: { createdBy: { not: 'referral' } },
    include: { _count: { select: { redemptions: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return promos.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description,
    type: p.type,
    value: p.value,
    scope: p.scope,
    minAmount: p.minAmount,
    maxRedemptions: p.maxRedemptions,
    perUserLimit: p.perUserLimit,
    redemptions: p._count.redemptions,
    expiresAt: p.expiresAt?.toISOString() ?? null,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function adminTogglePromo(id: string, active: boolean) {
  return prisma.promoCode.update({ where: { id }, data: { active } });
}
