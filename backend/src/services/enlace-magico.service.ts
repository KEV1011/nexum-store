/**
 * Puente de identidad: de un teléfono ya verificado por un tercero a una sesión.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ⚠  AQUÍ SE EMITEN SESIONES SIN OTP. LEER ANTES DE TOCAR.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `tokenParaTelefonoVerificado` entrega el MISMO token que el login normal sin
 * pedir código. Es correcto solo porque quien la llama ya comprobó, con la
 * firma criptográfica de Meta, que el mensaje viene del dueño de ese número:
 * nadie escribe por WhatsApp desde un teléfono que no controla.
 *
 * Eso la convierte en la función más peligrosa del backend si se expone. NO
 * puede haber una ruta que la llame con un teléfono del body — sería «dame la
 * sesión de quien yo diga». Su único llamador legítimo es el webhook de
 * WhatsApp DESPUÉS de validar la firma, y hay una prueba
 * (`enlace-magico-alcance.test.ts`) que falla si aparece en un archivo de
 * rutas. Este repositorio ya tiene dos incidentes de guardas puestas en puertas
 * que nadie usaba; esta es la puerta que de verdad importa.
 *
 * El token NO viaja en la URL del chat (ver `lib/enlace-magico.ts`): se emite
 * un código de un solo uso y es la app la que lo canjea.
 */

import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { normalizeColombianPhone } from './auth.service';
import type { ClientDTO, ClientJwtPayload } from '../types';
import {
  nuevoCodigo,
  codigoBienFormado,
  motivoParaNoCanjear,
  venceEn,
  VIGENCIA_MIN,
} from '../lib/enlace-magico';

function firmar(user: { id: string; phone: string; name: string | null }): {
  token: string;
  client: ClientDTO;
} {
  const client: ClientDTO = {
    id: user.id,
    phone: user.phone,
    name: user.name ?? 'Usuario ZIPA',
  };
  const payload: ClientJwtPayload = { clientId: user.id, phone: user.phone, role: 'client' };
  return { token: jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }), client };
}

/**
 * Cuenta del pasajero para un teléfono que un canal externo ya verificó.
 *
 * Crea la cuenta si es la primera vez, igual que hace `verifyClientOtp`. El
 * nombre del perfil de WhatsApp se usa solo para estrenar la cuenta: si el
 * usuario ya puso el suyo en la app, no se le pisa con el del chat.
 */
export async function usuarioParaTelefonoVerificado(
  telefono: string,
  nombreSugerido?: string | null,
): Promise<{ id: string; phone: string; name: string | null }> {
  const normalizado = normalizeColombianPhone(telefono);

  const existente = await prisma.user.findUnique({ where: { phone: normalizado } });
  if (existente) return existente;

  const limpio = (nombreSugerido ?? '').trim().slice(0, 60);
  return prisma.user.create({
    data: { phone: normalizado, name: limpio || 'Usuario ZIPA' },
  });
}

/** Sesión directa para un teléfono verificado por un tercero. Ver la cabecera. */
export async function tokenParaTelefonoVerificado(
  telefono: string,
  nombreSugerido?: string | null,
): Promise<{ token: string; client: ClientDTO }> {
  return firmar(await usuarioParaTelefonoVerificado(telefono, nombreSugerido));
}

/** Punto de recogida que viaja con el enlace, si el canal lo consiguió. */
export interface OrigenEnlace {
  lat: number;
  lng: number;
  etiqueta: string | null;
}

/**
 * Emite un código de un solo uso para ese usuario.
 *
 * Si ya tiene uno vivo y sin usar se reutiliza en vez de emitir otro: el
 * pasajero que escribe dos veces seguidas recibe el MISMO enlace, y el que
 * abrió el primero no se encuentra con que dejó de servir.
 *
 * ⚠ AL REUTILIZAR, EL ORIGEN SE ACTUALIZA. Sin esto habría un fallo silencioso
 * y caro: alguien escribe, recibe el botón, manda su ubicación, camina dos
 * cuadras, manda otra — y el segundo enlace seguiría llevando la primera, así
 * que el taxi iría a donde estuvo, no a donde está. El código puede ser el
 * mismo; el punto de recogida tiene que ser el último que mandó.
 */
export async function emitirEnlaceMagico(
  userId: string,
  canal: string,
  ahora: Date = new Date(),
  origen: OrigenEnlace | null = null,
): Promise<{ codigo: string; expiraEn: Date }> {
  const datosOrigen = {
    originLat: origen?.lat ?? null,
    originLng: origen?.lng ?? null,
    originLabel: origen?.etiqueta ?? null,
  };

  const vivo = await prisma.magicLink.findFirst({
    where: { userId, channel: canal, usedAt: null, expiresAt: { gt: ahora } },
    orderBy: { createdAt: 'desc' },
  });
  if (vivo) {
    // Solo se pisa si ahora traemos punto: un segundo mensaje de texto no puede
    // borrar la ubicación que el pasajero ya se tomó el trabajo de mandar.
    if (origen) {
      await prisma.magicLink.update({ where: { id: vivo.id }, data: datosOrigen });
    }
    return { codigo: vivo.code, expiraEn: vivo.expiresAt };
  }

  const expiraEn = venceEn(ahora, VIGENCIA_MIN);
  const creado = await prisma.magicLink.create({
    data: { code: nuevoCodigo(), userId, channel: canal, expiresAt: expiraEn, ...datosOrigen },
  });
  return { codigo: creado.code, expiraEn };
}

const MOTIVOS: Record<string, string> = {
  'enlace-inexistente': 'Este enlace no es válido. Escríbenos otra vez por WhatsApp.',
  'enlace-vencido': 'Este enlace ya venció. Escríbenos otra vez por WhatsApp y te mandamos uno nuevo.',
  'enlace-ya-usado': 'Este enlace ya se usó. Si cerraste la sesión, escríbenos por WhatsApp.',
};

export class EnlaceMagicoError extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'EnlaceMagicoError';
  }
}

/**
 * Canjea el código por el token real.
 *
 * El consumo es ATÓMICO: `updateMany` con `usedAt: null` en el `where`. Sin esa
 * guarda, dos pestañas abiertas con el mismo enlace —o un reintento de red—
 * darían dos sesiones a partir de un código «de un solo uso», que es justo lo
 * que el diseño promete que no pasa.
 */
export async function canjearEnlaceMagico(
  codigo: string,
  ahora: Date = new Date(),
): Promise<{ token: string; client: ClientDTO; origen: OrigenEnlace | null }> {
  if (!codigoBienFormado(codigo)) {
    throw new EnlaceMagicoError('enlace-inexistente', MOTIVOS['enlace-inexistente']!);
  }

  const enlace = await prisma.magicLink.findUnique({
    where: { code: codigo },
    include: { user: true },
  });

  const motivo = motivoParaNoCanjear(enlace, ahora);
  if (motivo) throw new EnlaceMagicoError(motivo, MOTIVOS[motivo] ?? MOTIVOS['enlace-inexistente']!);

  const consumido = await prisma.magicLink.updateMany({
    where: { code: codigo, usedAt: null },
    data: { usedAt: ahora },
  });
  if (consumido.count === 0) {
    throw new EnlaceMagicoError('enlace-ya-usado', MOTIVOS['enlace-ya-usado']!);
  }

  const { originLat, originLng, originLabel } = enlace!;
  const origen: OrigenEnlace | null =
    originLat !== null && originLng !== null
      ? { lat: originLat, lng: originLng, etiqueta: originLabel }
      : null;

  return { ...firmar(enlace!.user), origen };
}

/**
 * Borra los códigos ya vencidos o gastados hace tiempo.
 *
 * No hace falta guardarlos: un código consumido no prueba nada que no esté ya
 * en el registro del mensaje de WhatsApp.
 */
export async function purgarEnlacesMagicos(ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
  const r = await prisma.magicLink.deleteMany({ where: { expiresAt: { lt: limite } } });
  return r.count;
}
