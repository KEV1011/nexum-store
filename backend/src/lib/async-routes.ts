import { Router, application, type RequestHandler } from 'express';

/**
 * Hace que un handler `async` que lanza acabe en el manejador de errores
 * global, en vez de dejar la petición colgada.
 *
 * Express 4 no entiende de promesas: si un handler `async` rechaza, nadie llama
 * a `next(err)`. El error se registra como "unhandledRejection" y **nunca se
 * responde**. En el teléfono eso no se ve como un error, se ve como una app
 * congelada: el pasajero mira una rueda girando hasta que se rinde. Hay 88
 * handlers con `await` y sin `try/catch` en este backend, así que la diferencia
 * entre "sale un mensaje" y "se queda pensando" dependía de si alguien se
 * acordó de poner el try.
 *
 * Se parchea el prototipo del Router en vez de tocar los 88 sitios: uno solo
 * que se olvide vuelve a abrir el agujero. Es lo mismo que hace el paquete
 * `express-async-errors`, escrito aquí para no añadir una dependencia por
 * treinta líneas.
 *
 * IMPORTANTE: este módulo tiene que importarse ANTES que cualquier fichero de
 * rutas. Los `router.get(...)` se ejecutan al cargar el módulo, así que un
 * parche posterior no alcanzaría a los handlers ya registrados.
 */

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'all' | 'use';
const METODOS: Metodo[] = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

function envolver(fn: unknown): unknown {
  if (typeof fn !== 'function') return fn;
  // Los manejadores de ERROR tienen 4 parámetros (err, req, res, next) y Express
  // los distingue por la aridad: envolverlos cambiaría `fn.length` a 0 y
  // dejarían de reconocerse como tales, desactivando el manejador global.
  if (fn.length >= 4) return fn;

  const original = fn as RequestHandler;
  const envuelto: RequestHandler = (req, res, next) => {
    let r: unknown;
    try {
      r = original(req, res, next);
    } catch (e) {
      next(e);
      return;
    }
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).catch(next);
    }
  };
  return envuelto;
}

let parcheado = false;

function parchearObjeto(destino: Record<string, unknown>): void {
  for (const metodo of METODOS) {
    const original = destino[metodo];
    if (typeof original !== 'function') continue;
    destino[metodo] = function patched(this: unknown, ...args: unknown[]) {
      // El primer argumento puede ser la ruta (string/RegExp/array); solo se
      // envuelven las funciones.
      return (original as (...a: unknown[]) => unknown).apply(this, args.map(envolver));
    };
  }
}

/**
 * Aplica el parche. Idempotente.
 *
 * OJO con DÓNDE se parchea. En Express 4 el Router no es una clase: los métodos
 * (`get`, `post`, …) viven en el propio objeto función `express.Router`, y cada
 * router creado lo recibe como prototipo (`setPrototypeOf(router, Router)`).
 * Parchear `Router.prototype` —que es lo intuitivo y lo que se hizo primero— no
 * toca absolutamente nada: `Router.prototype.get` ni siquiera existe. Lo cazó la
 * prueba, que se quedaba colgada exactamente igual que la app.
 *
 * Se parchean los dos sitios: el Router (todos los ficheros de rutas) y
 * `express.application` (las rutas colgadas directamente de `app`, como /health).
 */
export function activarRutasAsincronas(): void {
  if (parcheado) return;
  parcheado = true;
  parchearObjeto(Router as unknown as Record<string, unknown>);
  parchearObjeto(application as unknown as Record<string, unknown>);
}

activarRutasAsincronas();
