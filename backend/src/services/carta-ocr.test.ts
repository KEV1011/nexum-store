import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  leerTextoDeCarta,
  modoCartaOcr,
  olvidarRechazoCarta,
  textoDeRespuestaVision,
  type Traer,
} from './carta-ocr.service';

// Lo que Google devuelve de verdad: el texto entero en `fullTextAnnotation`,
// con sus saltos de línea, más el desglose por bloques que no usamos.
function respuestaVision(texto: string): unknown {
  return {
    responses: [
      {
        textAnnotations: [{ description: texto }],
        fullTextAnnotation: { text: texto },
      },
    ],
  };
}

/** Un `fetch` de mentira que anota con qué lo llamaron. */
function traerQueDevuelve(
  cuerpo: unknown,
  opts: { ok?: boolean; status?: number; texto?: string } = {},
): { traer: Traer; llamadas: Array<{ url: string; init?: unknown }> } {
  const llamadas: Array<{ url: string; init?: unknown }> = [];
  const traer: Traer = async (url, init) => {
    llamadas.push({ url, init });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => cuerpo,
      text: async () => opts.texto ?? JSON.stringify(cuerpo),
    };
  };
  return { traer, llamadas };
}

const FOTO = { bytes: Buffer.from('bytes-de-la-foto'), mimetype: 'image/jpeg' };

describe('de la respuesta de Vision al texto', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('saca el texto CON sus saltos de línea', () => {
    // El parser se apoya en que cada plato va en su renglón. Un proveedor que
    // devolviera un párrafo corrido dejaría la carta en una sola fila.
    const r = textoDeRespuestaVision(respuestaVision('ENTRADAS\nPatacón 8.000'));
    expect(r.disponible).toBe(true);
    expect(r.texto).toBe('ENTRADAS\nPatacón 8.000');
  });

  it('el error de arriba de la respuesta NO pasa por bueno', () => {
    const r = textoDeRespuestaVision({ error: { status: 'PERMISSION_DENIED', message: 'x' } });
    expect(r.disponible).toBe(false);
    expect(r.texto).toBe('');
  });

  it('el error de DENTRO de responses[0] tampoco', () => {
    // Vision puede contestar 200 y rechazar la imagen concreta. Son dos sitios
    // distintos donde viene un error y hay que mirar los dos.
    const r = textoDeRespuestaVision({ responses: [{ error: { message: 'Bad image data' } }] });
    expect(r.disponible).toBe(false);
  });

  it('un 200 sin ninguna respuesta se trata como avería, no como carta vacía', () => {
    expect(textoDeRespuestaVision({ responses: [] }).disponible).toBe(false);
    expect(textoDeRespuestaVision(null).disponible).toBe(false);
  });

  it('una foto ilegible SÍ es «disponible» con texto vacío', () => {
    // Distinción que importa: el lector funcionó y lo que falla es la foto.
    // Marcarlo como no disponible haría que el dueño esperara a que
    // «arreglemos» algo, en vez de repetir la foto con mejor luz.
    const r = textoDeRespuestaVision({ responses: [{}] });
    expect(r.disponible).toBe(true);
    expect(r.texto).toBe('');
  });
});

describe('la llamada a Vision', () => {
  const previo = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env['CARTA_OCR_PROVIDER'] = 'google-vision';
    process.env['CARTA_OCR_API_KEY'] = 'llave-de-prueba';
    delete process.env['GOOGLE_MAPS_API_KEY'];
  });
  afterEach(() => {
    process.env = { ...previo };
    vi.restoreAllMocks();
  });

  it('manda los BYTES en base64, no una URL', async () => {
    // Es el defecto que tenía la primera versión: con la URL de `fileToUrl` y
    // sin S3 configurado, Google recibía `/uploads/...` del disco efímero de
    // Render y no podía abrir nada. Habría fallado en el primer uso real.
    const { traer, llamadas } = traerQueDevuelve(respuestaVision('Gaseosa 3.500'));
    const r = await leerTextoDeCarta(FOTO, traer);
    expect(r.texto).toBe('Gaseosa 3.500');

    const body = JSON.parse((llamadas[0]!.init as { body: string }).body) as {
      requests: Array<{
        image: { content?: string; source?: unknown };
        features: Array<{ type: string }>;
        imageContext: { languageHints: string[] };
      }>;
    };
    const req = body.requests[0]!;
    expect(req.image.source).toBeUndefined();
    expect(Buffer.from(req.image.content!, 'base64').toString()).toBe('bytes-de-la-foto');
    // DOCUMENT y no TEXT: la segunda mezcla los renglones de las dos columnas
    // de una carta, que es lo que le pegaría el precio de un plato a otro.
    expect(req.features[0]!.type).toBe('DOCUMENT_TEXT_DETECTION');
    // Sin la pista de idioma «Patacón» vuelve «Patacon» y el dueño corrige
    // cuarenta platos a mano, que es el trabajo que esto venía a quitar.
    expect(req.imageContext.languageHints).toEqual(['es']);
  });

  it('la llave viaja en la URL y no en el cuerpo', async () => {
    const { traer, llamadas } = traerQueDevuelve(respuestaVision('x 1.000'));
    await leerTextoDeCarta(FOTO, traer);
    expect(llamadas[0]!.url).toContain('vision.googleapis.com/v1/images:annotate');
    expect(llamadas[0]!.url).toContain('key=llave-de-prueba');
  });

  it('sirve la llave de los mapas si no hay una propia', async () => {
    delete process.env['CARTA_OCR_API_KEY'];
    process.env['GOOGLE_MAPS_API_KEY'] = 'llave-de-mapas';
    const { traer, llamadas } = traerQueDevuelve(respuestaVision('x 1.000'));
    await leerTextoDeCarta(FOTO, traer);
    expect(llamadas[0]!.url).toContain('key=llave-de-mapas');
  });

  it('sin ninguna llave no se llama a nadie y se dice que está apagado', async () => {
    delete process.env['CARTA_OCR_API_KEY'];
    const { traer, llamadas } = traerQueDevuelve(respuestaVision('x 1.000'));
    const r = await leerTextoDeCarta(FOTO, traer);
    expect(llamadas).toHaveLength(0);
    expect(r.disponible).toBe(false);
    expect(r.motivo).toMatch(/CSV/);
  });

  it('un 403 no se le echa en cara al dueño ni le nombra la configuración', async () => {
    // El fallo de estreno más probable: la llave existe pero su proyecto no
    // tiene habilitada Cloud Vision API. Lo técnico va al log del servidor y
    // a /health; al dueño se le dice que no es culpa de su foto.
    const { traer } = traerQueDevuelve({}, { ok: false, status: 403, texto: 'PERMISSION_DENIED' });
    const r = await leerTextoDeCarta(FOTO, traer);
    expect(r.disponible).toBe(false);
    expect(r.motivo).not.toMatch(/API|KEY|403|Vision/i);
    // Y tampoco le manda a esperar: un 403 no se arregla solo, y repetir la
    // foto era exactamente lo que estaba haciendo quien lo reportó.
    expect(r.motivo).not.toMatch(/en un rato/);
    expect(console.error).toHaveBeenCalled();
    olvidarRechazoCarta();
  });

  it('si la red falla, no se lanza: se contesta que no se pudo', async () => {
    const traer: Traer = async () => { throw new Error('ETIMEDOUT'); };
    const r = await leerTextoDeCarta(FOTO, traer);
    expect(r.disponible).toBe(false);
    expect(r.texto).toBe('');
  });
});

describe('el interruptor y lo que publica /health', () => {
  const previo = { ...process.env };
  afterEach(() => { process.env = { ...previo }; });

  it('sin variable, apagado y sin llamar a nadie', async () => {
    delete process.env['CARTA_OCR_PROVIDER'];
    expect(modoCartaOcr()).toBe('apagado');
    const { traer, llamadas } = traerQueDevuelve(respuestaVision('x'));
    expect((await leerTextoDeCarta(FOTO, traer)).disponible).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it('el proveedor puesto SIN llave se distingue del apagado', () => {
    // Poder recibir la variable y no tener llave se vería como un canal muerto
    // sin un solo error a la vista; /health lo tiene que decir.
    process.env['CARTA_OCR_PROVIDER'] = 'google-vision';
    delete process.env['CARTA_OCR_API_KEY'];
    delete process.env['GOOGLE_MAPS_API_KEY'];
    expect(modoCartaOcr()).toBe('google-vision-sin-llave');
    process.env['CARTA_OCR_API_KEY'] = 'k';
    expect(modoCartaOcr()).toBe('google-vision');
  });

  it('el modo de pruebas NUNCA responde en producción', async () => {
    process.env['CARTA_OCR_PROVIDER'] = 'fake';
    process.env['NODE_ENV'] = 'production';
    const r = await leerTextoDeCarta(FOTO);
    expect(r.disponible).toBe(false);
  });

  // ── El fallo que NO se arregla esperando ────────────────────────────────
  //
  // El dueño veía «inténtalo de nuevo en un rato» con una llave sin permisos,
  // así que repetía la foto indefinidamente. El 403 no se arregla solo, y
  // quien tiene que enterarse es quien administra la cuenta de Google.
  it('el rechazo permanente SÍ se ve en /health, que es donde se actúa', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    olvidarRechazoCarta();
    process.env['CARTA_OCR_PROVIDER'] = 'google-vision';
    process.env['CARTA_OCR_API_KEY'] = 'k';
    expect(modoCartaOcr()).toBe('google-vision');
    textoDeRespuestaVision({
      error: { status: 'PERMISSION_DENIED', message: 'not enabled' },
    });
    // Configurada y RECHAZANDO es un tercer estado. Sin él el diagnóstico
    // dice «google-vision» mientras ningún dueño consigue leer una carta.
    expect(modoCartaOcr()).toBe('google-vision-rechazada');
    olvidarRechazoCarta();
    vi.restoreAllMocks();
  });

  it('un 500 de Vision SÍ invita a reintentar: ese sí pasa solo', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    olvidarRechazoCarta();
    const r = textoDeRespuestaVision({ error: { status: 'INTERNAL', message: 'boom' } });
    expect(r.motivo).toContain('en un rato');
    // Y no ensucia el diagnóstico: un fallo pasajero no puede dejar /health
    // diciendo «rechazada» para siempre.
    process.env['CARTA_OCR_PROVIDER'] = 'google-vision';
    process.env['CARTA_OCR_API_KEY'] = 'k';
    expect(modoCartaOcr()).toBe('google-vision');
    vi.restoreAllMocks();
  });

  it('azure-read está admitido pero no finge funcionar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env['CARTA_OCR_PROVIDER'] = 'azure-read';
    process.env['NODE_ENV'] = 'test';
    const r = await leerTextoDeCarta(FOTO);
    expect(r.disponible).toBe(false);
    vi.restoreAllMocks();
  });
});
