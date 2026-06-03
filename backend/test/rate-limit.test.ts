import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { rateLimit } from '../src/middleware/rate-limit.middleware';

/** Construye un par req/res mínimo para ejercitar el middleware. */
function mockReqRes(ip: string): {
  req: Request;
  res: Response & { statusCode: number; body: unknown };
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const req = { ip, socket: { remoteAddress: ip } } as unknown as Request;
  return { req, res: res as unknown as Response & { statusCode: number; body: unknown }, headers };
}

function run(
  limiter: ReturnType<typeof rateLimit>,
  req: Request,
  res: Response,
): boolean {
  let passed = false;
  limiter(req, res, () => {
    passed = true;
  });
  return passed;
}

test('permite peticiones bajo el límite', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 3 });
  const { req, res } = mockReqRes('1.1.1.1');

  assert.equal(run(limiter, req, res), true);
  assert.equal(run(limiter, req, res), true);
  assert.equal(run(limiter, req, res), true);
});

test('bloquea con 429 al exceder el límite', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 2 });
  const { req, res } = mockReqRes('2.2.2.2');

  run(limiter, req, res);
  run(limiter, req, res);
  const passed = run(limiter, req, res);

  assert.equal(passed, false);
  assert.equal((res as unknown as { statusCode: number }).statusCode, 429);
  assert.deepEqual(
    (res as unknown as { body: { success: boolean } }).body.success,
    false,
  );
});

test('aísla el conteo por clave (IP)', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 1 });
  const a = mockReqRes('10.0.0.1');
  const b = mockReqRes('10.0.0.2');

  assert.equal(run(limiter, a.req, a.res), true);
  // La segunda IP no se ve afectada por el consumo de la primera.
  assert.equal(run(limiter, b.req, b.res), true);
  // La primera IP ya está en su tope.
  assert.equal(run(limiter, a.req, a.res), false);
});

test('expone cabeceras X-RateLimit-*', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 5 });
  const { req, res, headers } = mockReqRes('3.3.3.3');

  run(limiter, req, res);

  assert.equal(headers['X-RateLimit-Limit'], '5');
  assert.equal(headers['X-RateLimit-Remaining'], '4');
  assert.ok(headers['X-RateLimit-Reset']);
});

test('reinicia el conteo cuando expira la ventana', async () => {
  const limiter = rateLimit({ windowMs: 30, max: 1 });
  const { req, res } = mockReqRes('4.4.4.4');

  assert.equal(run(limiter, req, res), true);
  assert.equal(run(limiter, req, res), false);

  await new Promise((r) => setTimeout(r, 40));
  // Tras vencer la ventana, vuelve a permitir.
  assert.equal(run(limiter, req, res), true);
});
