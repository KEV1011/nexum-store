import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { LIMITES, esTiempoAgotado, motivoDeFallo, traerConLimite } from './fetch-con-limite';

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

/** Un `fetch` que no contesta nunca, pero obedece la señal. */
function fetchQueCuelga(): void {
  globalThis.fetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_resolver, rechazar) => {
      const s = init?.signal;
      if (!s) return; // sin señal se queda colgado: es justo lo que se prueba
      if (s.aborted) rechazar(s.reason);
      s.addEventListener('abort', () => rechazar(s.reason));
    })) as unknown as typeof fetch;
}

describe('traerConLimite', () => {
  it('corta una petición que no contesta', async () => {
    // LA prueba de la pieza. Sin esto, el `catch` que ya existía en
    // `medirTrayecto` era inalcanzable: un servicio lento no lanza nada.
    fetchQueCuelga();
    await expect(traerConLimite('https://ejemplo.test', {}, 40)).rejects.toSatisfy(esTiempoAgotado);
  });

  it('respeta la señal que ya traía quien llama', async () => {
    // Pisarla dejaría sin efecto una cancelación que casi siempre existe por
    // un motivo más importante que este límite.
    fetchQueCuelga();
    const propia = new AbortController();
    const p = traerConLimite('https://ejemplo.test', { signal: propia.signal }, 10_000);
    propia.abort(new Error('el cliente se fue'));
    await expect(p).rejects.toThrow('el cliente se fue');
  });

  it('deja pasar la respuesta cuando el servicio sí contesta', async () => {
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    const r = await traerConLimite('https://ejemplo.test', {}, 1_000);
    expect(r.status).toBe(200);
  });
});

describe('esTiempoAgotado', () => {
  it('reconoce el corte por tiempo', () => {
    const e = new Error('tiempo'); e.name = 'TimeoutError';
    expect(esTiempoAgotado(e)).toBe(true);
  });

  it('y la cancelación manual, que llega con otro nombre', () => {
    const e = new Error('cancelado'); e.name = 'AbortError';
    expect(esTiempoAgotado(e)).toBe(true);
  });

  it('también cuando viene envuelta', () => {
    // Según la versión de Node, `fetch` propaga la DOMException tal cual o la
    // envuelve en un TypeError con `cause`. Mirar solo el nivel de arriba
    // haría que en una de las dos el corte se contara como fallo de red.
    const dentro = new Error('tiempo'); dentro.name = 'TimeoutError';
    expect(esTiempoAgotado(new TypeError('fetch failed', { cause: dentro }))).toBe(true);
  });

  it('un fallo de red NO es un corte por tiempo', () => {
    // Se arreglan distinto: uno es «el proveedor va lento, usa el respaldo»,
    // el otro es «alguien tiene que mirar esto».
    expect(esTiempoAgotado(new TypeError('fetch failed'))).toBe(false);
    expect(esTiempoAgotado(null)).toBe(false);
    expect(esTiempoAgotado('texto')).toBe(false);
  });
});

describe('motivoDeFallo', () => {
  it('dice el servicio y los segundos, no el nombre interno del error', () => {
    const e = new Error('x'); e.name = 'TimeoutError';
    expect(motivoDeFallo(e, 'Google Routes', LIMITES.COTIZACION))
      .toBe('Google Routes no contestó en 6 s');
  });

  it('y conserva el mensaje del proveedor cuando lo hay', () => {
    expect(motivoDeFallo(new Error('billing disabled'), 'Google Routes', 6_000))
      .toContain('billing disabled');
  });
});

describe('los límites', () => {
  it('ninguno hace esperar más de lo que nadie aguanta', () => {
    for (const [nombre, ms] of Object.entries(LIMITES)) {
      expect(ms, nombre).toBeGreaterThanOrEqual(3_000); // por debajo se corta lo que iba a llegar
      expect(ms, nombre).toBeLessThanOrEqual(30_000);
    }
  });

  it('lo que tiene a alguien esperando con el dedo en el botón es lo más corto', () => {
    // El orden no es decorativo: cotizar un viaje y escribir una dirección
    // son las dos únicas esperas que el usuario vive en primera persona y sin
    // nada que mirar mientras tanto.
    expect(LIMITES.COTIZACION).toBeLessThan(LIMITES.SMS);
    expect(LIMITES.INTERACTIVO).toBeLessThan(LIMITES.MAPA);
    expect(LIMITES.DIAGNOSTICO).toBeGreaterThan(LIMITES.COTIZACION);
  });
});

/**
 * La guarda que impide que esto se vuelva a acumular.
 *
 * Es el patrón de `moneda-portal.test.ts`: copiar tres líneas siempre será
 * más rápido que buscar el ayudante, así que la regla se vigila en vez de
 * escribirse en un comentario que nadie lee. Trece llamadas sin límite no se
 * escribieron de golpe; se fueron sumando de una en una.
 */
describe('ningún servicio llama a fuera sin límite', () => {
  const DIR = join(__dirname, '..', 'services');

  it('ni un `fetch(` suelto en los servicios que salen a internet', () => {
    const sueltos: string[] = [];
    for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.service.ts'))) {
      const texto = readFileSync(join(DIR, archivo), 'utf8');
      texto.split('\n').forEach((linea, i) => {
        // Los comentarios quedan fuera: tres servicios documentan en un
        // bloque comentado cómo sería la llamada al proveedor real que aún no
        // se contrata, y marcarlos haría que la regla se aprendiera a ignorar.
        if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
        // `traerConLimite(` y `_googleFetch(` son los envoltorios; `fetch(`
        // a secas, no. Se mira la llamada, no la palabra: `await fetch(` sí,
        // `typeof fetch` no.
        if (!/(?:^|[^\w.])fetch\s*\(/.test(linea)) return;
        if (/traerConLimite|_googleFetch|type\s+Traer|signal:\s*AbortSignal/.test(linea)) return;
        sueltos.push(`${archivo}:${i + 1}  ${linea.trim()}`);
      });
    }
    expect(sueltos, `Usa traerConLimite(..., LIMITES.X):\n${sueltos.join('\n')}`).toEqual([]);
  });
});
