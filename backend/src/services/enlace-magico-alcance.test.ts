import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHmac } from 'crypto';

/**
 * Esta función emite una sesión de cliente SIN pedir OTP.
 *
 * Es correcta solo mientras su único llamador sea el webhook de WhatsApp
 * después de validar la firma de Meta. El día que alguien la llame desde una
 * ruta con un teléfono del body, la API entera pasa a ser «dame la sesión de
 * quien yo diga» — y eso no lo cazan ni el compilador ni el linter, porque es
 * una llamada perfectamente válida.
 *
 * Este archivo es esa red. La primera mitad vigila quién la puede llamar; la
 * segunda EJECUTA la validación de firma, porque leer el código no prueba que
 * una comprobación de seguridad funcione (lección del guard del panel admin).
 */

const SRC = join(__dirname, '..');
const PELIGROSAS = ['tokenParaTelefonoVerificado', 'usuarioParaTelefonoVerificado'];

/** Archivos .ts de un directorio, sin pruebas. */
function fuentes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return fuentes(p);
    if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) return [];
    return [p];
  });
}

describe('quién puede emitir una sesión sin OTP', () => {
  it('ninguna ruta la nombra siquiera', () => {
    const culpables: string[] = [];
    for (const archivo of fuentes(join(SRC, 'routes'))) {
      const texto = readFileSync(archivo, 'utf8');
      for (const fn of PELIGROSAS) {
        if (texto.includes(fn)) culpables.push(`${archivo.replace(SRC, 'src')} → ${fn}`);
      }
    }
    expect(culpables, 'una ruta llama a la emisión de sesión sin OTP').toEqual([]);
  });

  it('fuera de su módulo, solo la llama el servicio de WhatsApp', () => {
    const permitidos = new Set([
      join(SRC, 'services', 'enlace-magico.service.ts'),
      join(SRC, 'services', 'whatsapp.service.ts'),
    ]);

    const inesperados: string[] = [];
    for (const archivo of fuentes(SRC)) {
      if (permitidos.has(archivo)) continue;
      const texto = readFileSync(archivo, 'utf8');
      for (const fn of PELIGROSAS) {
        if (texto.includes(fn)) inesperados.push(`${archivo.replace(SRC, 'src')} → ${fn}`);
      }
    }
    expect(inesperados).toEqual([]);
  });

  it('el webhook valida la firma ANTES de procesar', () => {
    const ruta = readFileSync(join(SRC, 'routes', 'webhooks.routes.ts'), 'utf8');

    // Solo el CUERPO del manejador. Mirar el archivo entero engaña: la primera
    // aparición de «firmaValida» es la línea del import, que va arriba del todo
    // pase lo que pase — con eso la comprobación pasaba aunque la validación se
    // hubiera movido detrás del procesamiento (verificado rompiéndolo).
    const inicio = ruta.indexOf("router.post('/whatsapp'");
    expect(inicio, 'ya no existe el webhook de WhatsApp').toBeGreaterThan(-1);
    const cuerpo = ruta.slice(inicio);

    const iFirma = cuerpo.indexOf('if (!firmaValida(');
    const iProceso = cuerpo.indexOf('procesarEntrante(payload');
    expect(iFirma, 'el webhook dejó de comprobar la firma').toBeGreaterThan(-1);
    expect(iProceso, 'el webhook dejó de procesar').toBeGreaterThan(-1);
    expect(iProceso, 'se procesa antes de validar la firma').toBeGreaterThan(iFirma);

    // Falla cerrado: sin secreto configurado no se procesa nada, y eso se
    // decide antes que ninguna otra cosa.
    const iCerrado = cuerpo.indexOf('puedeRecibirWhatsapp()');
    expect(iCerrado, 'el webhook dejó de fallar cerrado').toBeGreaterThan(-1);
    expect(iCerrado).toBeLessThan(iFirma);
  });
});

describe('la firma del webhook, ejecutada de verdad', () => {
  const SECRETO = 'secreto-de-prueba-no-es-de-nadie';
  const cuerpo = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }));

  function firmar(buf: Buffer, secreto: string): string {
    return 'sha256=' + createHmac('sha256', secreto).update(buf).digest('hex');
  }

  async function conSecreto(secreto: string) {
    vi.resetModules();
    process.env['WHATSAPP_APP_SECRET'] = secreto;
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'token-handshake';
    return import('./whatsapp.service');
  }

  beforeEach(() => {
    delete process.env['WHATSAPP_APP_SECRET'];
    delete process.env['WHATSAPP_VERIFY_TOKEN'];
  });

  it('acepta la firma correcta', async () => {
    const { firmaValida } = await conSecreto(SECRETO);
    expect(firmaValida(cuerpo, firmar(cuerpo, SECRETO))).toBe(true);
  });

  it('rechaza un cuerpo alterado', async () => {
    const { firmaValida } = await conSecreto(SECRETO);
    const firma = firmar(cuerpo, SECRETO);
    const alterado = Buffer.from(JSON.stringify({ entry: [{ changes: [1] }] }));
    expect(firmaValida(alterado, firma)).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', async () => {
    const { firmaValida } = await conSecreto(SECRETO);
    expect(firmaValida(cuerpo, firmar(cuerpo, 'otro-secreto'))).toBe(false);
  });

  it('rechaza la cabecera ausente, vacía o sin el prefijo', async () => {
    const { firmaValida } = await conSecreto(SECRETO);
    expect(firmaValida(cuerpo, undefined)).toBe(false);
    expect(firmaValida(cuerpo, '')).toBe(false);
    expect(firmaValida(cuerpo, createHmac('sha256', SECRETO).update(cuerpo).digest('hex'))).toBe(
      false,
    );
  });

  it('SIN secreto configurado rechaza todo: falla cerrado', async () => {
    vi.resetModules();
    const { firmaValida, puedeRecibirWhatsapp, whatsappMode } = await import('./whatsapp.service');
    expect(puedeRecibirWhatsapp()).toBe(false);
    expect(whatsappMode()).toBe('apagado');
    // Ni siquiera una firma «vacía» calculada con secreto vacío entra.
    expect(firmaValida(cuerpo, firmar(cuerpo, ''))).toBe(false);
  });

  it('el handshake exige el token exacto', async () => {
    const { respuestaHandshake } = await conSecreto(SECRETO);
    expect(respuestaHandshake('subscribe', 'token-handshake', 'reto')).toBe('reto');
    expect(respuestaHandshake('subscribe', 'otro', 'reto')).toBeNull();
    expect(respuestaHandshake('unsubscribe', 'token-handshake', 'reto')).toBeNull();
    expect(respuestaHandshake(undefined, undefined, undefined)).toBeNull();
  });
});
