/**
 * La prueba de que el respaldo del precio YA ES ALCANZABLE.
 *
 * `medirTrayecto` siempre tuvo un `catch` que cae a la línea recta. Pero un
 * `catch` solo atrapa un error, y un Google LENTO no da ninguno: el respaldo
 * estaba escrito y era inalcanzable justo en el caso para el que se escribió,
 * así que el pasajero se quedaba con el botón «Pedir» girando sin precio, sin
 * error y sin saber si tocar otra vez.
 *
 * Esto se mide con el `fetch` global colgado a propósito. Si alguien quita el
 * límite de la llamada que cotiza, esta prueba no falla: **se queda colgada
 * hasta el tiempo máximo de vitest**, que es exactamente el síntoma que
 * describe. Comprobado quitándolo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const original = globalThis.fetch;
const llaveOriginal = process.env['GOOGLE_MAPS_API_KEY'];

beforeAll(() => {
  // Sin llave, `medirTrayecto` ni lo intenta y la prueba no probaría nada.
  process.env['GOOGLE_MAPS_API_KEY'] = 'llave-de-prueba';
  vi.resetModules();
});
afterAll(() => {
  globalThis.fetch = original;
  if (llaveOriginal === undefined) delete process.env['GOOGLE_MAPS_API_KEY'];
  else process.env['GOOGLE_MAPS_API_KEY'] = llaveOriginal;
  vi.resetModules();
});

describe('cotizar un viaje con Google callado', () => {
  it('devuelve precio por la línea recta en vez de quedarse esperando', async () => {
    globalThis.fetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolver, rechazar) => {
        const s = init?.signal;
        if (!s) return;
        s.addEventListener('abort', () => rechazar(s.reason));
      })) as unknown as typeof fetch;

    const { medirTrayecto } = await import('./trip-options.service');

    const arranque = Date.now();
    // Pamplona centro → salida a Cúcuta, unos 3 km en recta.
    const r = await medirTrayecto(7.3754, -72.6486, 7.3961, -72.6321);
    const tardo = Date.now() - arranque;

    expect(r.distanceKm).toBeGreaterThan(0);
    // Y lo DICE: la app avisa de que el precio es aproximado en vez de
    // presentarlo como definitivo.
    expect(r.rutaReal).toBe(false);
    // El número no es el límite exacto —la máquina de CI respira— pero sí
    // tiene que estar en el orden de lo que una persona aguanta.
    expect(tardo).toBeLessThan(10_000);
  }, 20_000);
});
