import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// El conductor «en viaje» que late desde su pantalla de inicio.
//
// La prueba de verdad es `e2e/repartidor-en-viaje-sin-servicio.ts` (servidor de
// sockets real contra PostgreSQL), pero los E2E no corren en el CI. Esto vigila
// que las piezas sigan escritas donde tienen que estar: si alguien quita una,
// el síntoma es que a un repartidor conectado dejan de llegarle ofertas, y eso
// no lo delata ninguna otra prueba.
// ─────────────────────────────────────────────────────────────────────────────

const leer = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('el conductor en viaje que late sin servicio', () => {
  const ws = leer('websocket', 'ws.handler.ts');
  const lib = leer('lib', 'liberar-conductor.ts');

  it('cada latido pasa por la vigilancia, con el id de servicio que traiga', () => {
    expect(ws).toContain('_vigilarLatidoSinServicio(ws, driverId, antes, tripId);');
  });

  it('solo cuenta el latido SIN servicio de quien está EN VIAJE', () => {
    // Con el id presente la app tiene el servicio en pantalla: no se toca.
    expect(ws).toContain("if (antes !== 'ON_TRIP' || tripId !== null) { _ociosoEnViaje.delete(driverId); return; }");
  });

  it('solo por el socket vigente, y un hueco reinicia la cuenta', () => {
    const cuerpo = ws.slice(ws.indexOf('function _vigilarLatidoSinServicio'));
    expect(cuerpo).toMatch(/driverConnections\.get\(driverId\)\?\.ws !== ws\) return;/);
    expect(cuerpo).toMatch(/ahora - v\.ultimo > 30_000/);
  });

  it('un servicio recién movido no es huérfano: no se libera', () => {
    expect(lib).toContain('if (abiertos.some((s) => s.updatedAt.getTime() > corte))');
  });

  it('solo pasa de EN VIAJE a EN LÍNEA: a un desconectado no lo conecta', () => {
    const cuerpo = lib.slice(lib.indexOf('export async function liberarConductorOcioso'));
    expect(cuerpo).toMatch(/where: \{ id: driverId, status: 'ON_TRIP' \}/);
  });

  it('no toca los servicios huérfanos (ni los cierra ni los cancela)', () => {
    const cuerpo = lib.slice(lib.indexOf('export async function liberarConductorOcioso'));
    expect(cuerpo).not.toMatch(/prisma\.(trip|order|errand)\.(update|delete)/);
  });
});

describe('la compra busca también donde está el cliente', () => {
  const matching = leer('services', 'matching.service.ts');
  const compra = leer('services', 'comercio-no-reclamado.service.ts');

  it('sin nadie cerca de la recogida, se busca cerca de la entrega', () => {
    expect(matching).toContain('if (puntoValido(entrega) && !mismoSitio(entrega, { lat: pickupLat, lng: pickupLng }))');
  });

  it('la compra guarda el punto de entrega en el mandado', () => {
    expect(compra).toContain('...(entrega ? { dropoffLat: entrega.lat, dropoffLng: entrega.lng } : {}),');
  });
});
