import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cuerpoDePeticion,
  leerRespuestaModelo,
  modoCartaIa,
  olvidarRechazoIA,
  olvidarUsosIA,
  reservarUsoIA,
  revisarCartaConIA,
  type EntradaRevisor,
} from './carta-ia.service';
import type { Traer } from './carta-ocr.service';

const ENTRADA: EntradaRevisor = {
  imagen: { bytes: Buffer.from('foto'), mimetype: 'image/jpeg' },
  filas: [{ linea: 1, nombre: 'Gaseosa', precio: 3500, descripcion: '', seccion: 'Bebidas', rol: 'plato' }],
  secciones: ['Bebidas'],
  textoCrudo: 'BEBIDAS\nGaseosa 3.500',
};

const ENV = { ...process.env };
beforeEach(() => {
  olvidarRechazoIA();
  olvidarUsosIA();
});
afterEach(() => {
  process.env = { ...ENV };
});

function respondeCon(status: number, cuerpo: unknown): { traer: Traer; pedidos: Array<{ url: string; init?: unknown }> } {
  const pedidos: Array<{ url: string; init?: unknown }> = [];
  const traer: Traer = async (url, init) => {
    pedidos.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => cuerpo,
      text: async () => JSON.stringify(cuerpo),
    };
  };
  return { traer, pedidos };
}

const conHerramienta = (input: unknown) => ({
  content: [{ type: 'text', text: 'listo' }, { type: 'tool_use', name: 'revisar_carta', input }],
});

describe('apagado mientras no se configure', () => {
  it('sin variable está apagado y no llama a nadie', async () => {
    delete process.env['CARTA_IA_PROVIDER'];
    const { traer, pedidos } = respondeCon(200, {});
    const r = await revisarCartaConIA(ENTRADA, traer);
    expect(r.disponible).toBe(false);
    expect(pedidos).toHaveLength(0);
    expect(modoCartaIa()).toBe('apagado');
  });

  it('con proveedor y sin llave lo dice, en vez de parecer apagado', () => {
    process.env['CARTA_IA_PROVIDER'] = 'anthropic';
    delete process.env['ANTHROPIC_API_KEY'];
    expect(modoCartaIa()).toBe('anthropic-sin-llave');
  });

  it('un valor mal escrito no enciende nada', () => {
    process.env['CARTA_IA_PROVIDER'] = 'anthropic2';
    expect(modoCartaIa()).toBe('configuracion-no-reconocida');
  });

  it('el modo de pruebas no existe en producción', () => {
    process.env['CARTA_IA_PROVIDER'] = 'fake';
    process.env['NODE_ENV'] = 'production';
    expect(modoCartaIa()).toBe('apagado');
  });
});

describe('la pregunta al modelo', () => {
  it('va con la foto, la herramienta forzada y las filas', () => {
    const cuerpo = cuerpoDePeticion(ENTRADA) as {
      tool_choice: { name: string };
      messages: Array<{ content: Array<{ type: string; text?: string; source?: { media_type: string } }> }>;
    };
    expect(cuerpo.tool_choice.name).toBe('revisar_carta');
    const contenido = cuerpo.messages[0]!.content;
    expect(contenido[0]!.type).toBe('image');
    expect(contenido[0]!.source!.media_type).toBe('image/jpeg');
    expect(contenido[1]!.text).toContain('"nombre":"Gaseosa"');
    expect(contenido[1]!.text).toContain('Gaseosa 3.500');
  });

  it('una imagen demasiado grande se omite y se revisa con el texto', () => {
    const grande = { ...ENTRADA, imagen: { bytes: Buffer.alloc(6 * 1024 * 1024), mimetype: 'image/jpeg' } };
    const contenido = (cuerpoDePeticion(grande) as { messages: Array<{ content: Array<{ type: string }> }> })
      .messages[0]!.content;
    expect(contenido.map((x) => x.type)).toEqual(['text']);
  });

  it('la instrucción del dueño viaja como lo que es', () => {
    const cuerpo = cuerpoDePeticion({ ...ENTRADA, instruccion: 'la gaseosa es bebida' });
    expect(JSON.stringify(cuerpo)).toContain('EL DUEÑO DICE QUE ESTO ESTÁ MAL');
  });
});

describe('la respuesta del modelo', () => {
  it('se leen las correcciones de la herramienta', () => {
    const r = leerRespuestaModelo(conHerramienta({
      resumen: 'Una bebida mal clasificada',
      correcciones: [{ linea: 1, accion: 'rol', rol: 'acompanamiento', confianza: 'alta', motivo: 'Es bebida' }],
    }));
    expect(r!.correcciones).toHaveLength(1);
    expect(r!.resumen).toBe('Una bebida mal clasificada');
  });

  it('sin la herramienta no hay revisión (prosa no se adivina)', () => {
    expect(leerRespuestaModelo({ content: [{ type: 'text', text: 'la línea 1 es bebida' }] })).toBeNull();
  });

  it('llamada completa: cabeceras y correcciones', async () => {
    process.env['CARTA_IA_PROVIDER'] = 'anthropic';
    process.env['ANTHROPIC_API_KEY'] = 'sk-prueba';
    const { traer, pedidos } = respondeCon(200, conHerramienta({ resumen: 'ok', correcciones: [] }));
    const r = await revisarCartaConIA(ENTRADA, traer);
    expect(r.disponible).toBe(true);
    const init = pedidos[0]!.init as { headers: Record<string, string> };
    expect(pedidos[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-prueba');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('una llave rechazada queda en /health y al dueño no se le nombra la configuración', async () => {
    process.env['CARTA_IA_PROVIDER'] = 'anthropic';
    process.env['ANTHROPIC_API_KEY'] = 'sk-mala';
    const { traer } = respondeCon(401, { error: { message: 'invalid x-api-key' } });
    const r = await revisarCartaConIA(ENTRADA, traer);
    expect(r.disponible).toBe(false);
    expect(r.motivo).not.toMatch(/ANTHROPIC|api|llave/i);
    expect(modoCartaIa()).toBe('anthropic-rechazada');
    // Y vuelve a la verdad en cuanto contesta bien.
    const bien = respondeCon(200, conHerramienta({ resumen: '', correcciones: [] }));
    await revisarCartaConIA(ENTRADA, bien.traer);
    expect(modoCartaIa()).toBe('anthropic');
  });
});

describe('el cupo por negocio', () => {
  it('corta al llegar al tope y se recupera al pasar la hora', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(reservarUsoIA('b1', t0 + i)).toBe(true);
    expect(reservarUsoIA('b1', t0 + 100)).toBe(false);
    // Otro negocio no paga por el primero.
    expect(reservarUsoIA('b2', t0 + 100)).toBe(true);
    expect(reservarUsoIA('b1', t0 + 60 * 60 * 1000 + 50)).toBe(true);
  });
});
