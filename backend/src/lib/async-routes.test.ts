import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import './async-routes';

/**
 * Lo que se comprueba: que un handler `async` que lanza acabe en el manejador
 * de errores global.
 *
 * Sin el parche, Express 4 se queda con la promesa rechazada y NUNCA responde.
 * Por eso cada petición lleva su propio corte de tiempo: si alguien quita el
 * parche, esto no falla con un mensaje bonito — se queda esperando, que es
 * exactamente el síntoma que sufre el usuario.
 *
 * Se levanta un servidor de verdad en un puerto libre en vez de usar supertest:
 * una dependencia nueva por cuatro pruebas no se paga sola.
 */
async function pedir(app: express.Express, ruta: string): Promise<{ status: number; body: unknown }> {
  const server = app.listen(0);
  try {
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${ruta}`, {
      signal: AbortSignal.timeout(3000),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function appDePrueba(): express.Express {
  const app = express();
  const router = express.Router();

  router.get('/lanza-async', async () => {
    await Promise.resolve();
    throw new Error('fallo dentro de un handler async');
  });
  router.get('/lanza-sincrono', () => {
    throw new Error('fallo síncrono');
  });
  router.get('/bien', async (_req, res) => {
    await Promise.resolve();
    res.json({ success: true });
  });

  app.use(router);
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
  return app;
}

describe('rutas async', () => {
  it('un handler async que lanza responde 500 en vez de colgarse', async () => {
    const res = await pedir(appDePrueba(), '/lanza-async');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Internal server error' });
  });

  it('un handler síncrono que lanza sigue funcionando como antes', async () => {
    const res = await pedir(appDePrueba(), '/lanza-sincrono');
    expect(res.status).toBe(500);
  });

  it('un handler que va bien no se ve afectado', async () => {
    const res = await pedir(appDePrueba(), '/bien');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('el manejador de errores (4 argumentos) NO se envuelve', async () => {
    // Envolverlo cambiaría su aridad a 3 y Express dejaría de reconocerlo como
    // manejador de errores: los fallos volverían a quedar sin respuesta. Es la
    // parte frágil del parche, así que se comprueba explícitamente que el error
    // LLEGA hasta él.
    const app = express();
    const router = express.Router();
    router.get('/x', async () => {
      throw new Error('boom');
    });
    app.use(router);
    let mensaje: string | null = null;
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      mensaje = err.message;
      res.status(500).json({ ok: false });
    });
    await pedir(app, '/x');
    expect(mensaje).toBe('boom');
  });
});
