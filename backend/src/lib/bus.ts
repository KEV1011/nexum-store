import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';

// ─── Bus de entrega entre instancias ──────────────────────────────────────────
//
// El WebSocket handler mantiene mapas de sockets locales por instancia. Para
// escalar horizontalmente (varias instancias detrás de un balanceador), una
// instancia debe poder entregar un mensaje a un cliente/conductor conectado en
// OTRA instancia. Este bus resuelve ese problema con Redis Pub/Sub:
//
//   • Sin REDIS_URL  → el bus queda inactivo. La entrega es solo local; el
//     comportamiento es idéntico al de una sola instancia (modo actual).
//   • Con REDIS_URL  → cada entrega por id (sendToClient / sendToDriverById) se
//     publica en un canal Redis; todas las instancias la reciben y la entregan
//     a su socket local si el destinatario está conectado ahí.
//
// Cada instancia tiene un id único; ignora sus propios mensajes publicados para
// no entregar dos veces (el origen ya entregó localmente).
//
// NOTA: esto cubre la ENTREGA por id. El emparejamiento (estado de ofertas en
// matching.service) y las suscripciones por socket siguen siendo por instancia
// — ver docs/SCALING.md para el trabajo restante antes de activar multi-instancia.

export interface BusTarget {
  kind: 'client' | 'driver' | 'business';
  id: string;
}

type DeliverFn = (target: BusTarget, payload: Record<string, unknown>) => void;

const REDIS_URL = process.env['REDIS_URL'];
const CHANNEL = 'nx:ws:deliver';
const INSTANCE_ID = randomUUID();

let deliverLocal: DeliverFn | null = null;
let pub: Redis | null = null;
let sub: Redis | null = null;
let enabled = false;

export const busInstanceId = INSTANCE_ID;

export function isBusEnabled(): boolean {
  return enabled;
}

/**
 * Inicializa el bus. [deliver] entrega un mensaje a un socket LOCAL (sin volver
 * a publicar). Es seguro llamarlo siempre: sin REDIS_URL es un no-op silencioso.
 */
export async function initBus(deliver: DeliverFn): Promise<void> {
  deliverLocal = deliver;
  if (!REDIS_URL) {
    console.log('[Bus] REDIS_URL no definido — entrega local (instancia única).');
    return;
  }
  try {
    const { default: RedisCtor } = await import('ioredis');
    pub = new RedisCtor(REDIS_URL);
    sub = new RedisCtor(REDIS_URL);
    sub.on('message', (_channel: string, raw: string) => {
      try {
        const msg = JSON.parse(raw) as {
          from: string;
          target: BusTarget;
          payload: Record<string, unknown>;
        };
        if (msg.from === INSTANCE_ID) return; // ya entregado en el origen
        deliverLocal?.(msg.target, msg.payload);
      } catch {
        /* mensaje malformado: ignorar */
      }
    });
    await sub.subscribe(CHANNEL);
    enabled = true;
    console.log(
      `[Bus] Redis Pub/Sub activo (instancia ${INSTANCE_ID.slice(0, 8)}) — ` +
        'entrega entre instancias habilitada.',
    );
  } catch (err) {
    console.error('[Bus] No se pudo inicializar Redis; entrega local solamente.', err);
    pub = null;
    sub = null;
    enabled = false;
  }
}

/**
 * Publica una entrega para que las demás instancias la entreguen a su socket
 * local. No-op si el bus está inactivo (sin Redis).
 */
export function publishDelivery(target: BusTarget, payload: Record<string, unknown>): void {
  if (!enabled || !pub) return;
  try {
    void pub.publish(CHANNEL, JSON.stringify({ from: INSTANCE_ID, target, payload }));
  } catch {
    /* ignore */
  }
}
