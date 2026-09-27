// ── Leer el TEXTO de una foto de carta ───────────────────────────────────────
//
// Va aparte de `ocr.service.ts` y con su PROPIA variable a propósito: aquél
// extrae campos de un documento de identidad (Truora, Metamap) y esto es OCR
// de texto corrido (Google Cloud Vision, Azure Read). Son capacidades que se
// contratan por separado, y meterlas en el mismo interruptor haría creer que
// activar una activa la otra.
//
// SIN PROVEEDOR NO SE FINGE. Se devuelve `disponible: false` y la ruta
// responde diciéndolo, en vez de una lista vacía que el dueño leería como
// «mi carta no se entiende» y le haría repetir la foto tres veces.
//
// ENTRAN LOS BYTES, NO UNA URL. La primera versión de esto recibía la URL que
// deja `fileToUrl`, y habría fallado en el PRIMER uso real: sin S3/R2
// configurado esa URL es una ruta relativa (`/uploads/...`) sobre el disco
// EFÍMERO de Render, que Google no puede abrir. Mandar el contenido en la
// petición además evita guardar la foto: del catálogo interesa el texto, y la
// imagen de la carta no se vuelve a mirar nunca.
//
// EL `motivo` LO LEE EL DUEÑO DEL RESTAURANTE, así que nunca nombra una
// variable de entorno ni un código de Google: lo técnico va al log del
// servidor, que es donde alguien puede arreglarlo.

export type ProveedorCarta = 'none' | 'fake' | 'google-vision' | 'azure-read';

export interface TextoDeCarta {
  /** Hubo proveedor y contestó. */
  disponible: boolean;
  texto: string;
  /** Qué decirle al dueño cuando no se pudo. Vacío si salió bien. */
  motivo?: string;
}

/** La foto tal como llegó: el contenido, no una ruta a ninguna parte. */
export interface ImagenDeCarta {
  bytes: Buffer;
  /** `image/jpeg`, `image/png`… Lo usa Azure como `Content-Type`. */
  mimetype: string;
}

/** Costura para las pruebas: el mismo `fetch` global, inyectable. */
export type Traer = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/**
 * Cuánto se espera al proveedor. Al otro lado hay un dueño mirando un botón
 * girar con la carta en la mano: preferimos decirle que lo intente otra vez a
 * dejarlo colgado indefinidamente.
 */
const ESPERA_MS = 25_000;

export function proveedorCarta(): ProveedorCarta {
  const p = (process.env['CARTA_OCR_PROVIDER'] ?? '').trim().toLowerCase();
  if (p === 'fake' || p === 'google-vision' || p === 'azure-read') return p;
  return 'none';
}

/**
 * La llave con la que se llama a Vision. Se admite una propia para poder
 * restringirla SOLO a Vision en Google Cloud; si no hay, se reutiliza la de
 * los mapas, que es la misma cuenta.
 */
function llaveVision(): string {
  return (
    process.env['CARTA_OCR_API_KEY']
    ?? process.env['GOOGLE_MAPS_API_KEY']
    ?? ''
  ).trim();
}

/** Para `/health`: qué está activo, en español. */
export function modoCartaOcr(): string {
  switch (proveedorCarta()) {
    case 'google-vision':
      return llaveVision() ? 'google-vision' : 'google-vision-sin-llave';
    case 'azure-read':
      return 'azure-read';
    case 'fake': return 'pruebas';
    default: return 'apagado';
  }
}

/** Carta de ejemplo para el E2E: el mismo texto siempre, nunca en producción. */
const CARTA_DE_PRUEBA = [
  'ENTRADAS',
  'Patacón con hogao 8.000',
  'Empanadas (3) $6.000',
  'PLATOS FUERTES',
  'Bandeja paisa ....... $25.000',
  'Mojarra frita 22.500',
  'BEBIDAS',
  'Jugo natural 5.000 / 7.000',
  'Gaseosa 3.500',
].join('\n');

/** Lo que el dueño lee cuando el lector no está o no contestó. */
const APAGADO =
  'La lectura de cartas por foto todavía no está activada en esta cuenta. '
  + 'Puedes cargar tus productos con el archivo CSV o uno por uno.';
const NO_CONTESTO =
  'No pudimos leer la carta en este momento. Inténtalo de nuevo en un rato, '
  + 'o carga tus productos con el archivo CSV.';

/**
 * Saca el texto de la respuesta de Vision.
 *
 * Se aísla del `fetch` porque es donde de verdad se puede equivocar uno: la
 * respuesta trae DOS sitios donde puede venir un error (arriba y dentro de
 * `responses[0]`), y un 200 con `responses: []` es un caso real cuando la
 * petición se aceptó pero no produjo nada.
 */
export function textoDeRespuestaVision(cuerpo: unknown): TextoDeCarta {
  const raiz = (cuerpo ?? {}) as {
    error?: { message?: string; status?: string };
    responses?: Array<{
      error?: { message?: string };
      fullTextAnnotation?: { text?: string };
    }>;
  };

  if (raiz.error?.message) {
    console.error(`[CartaOCR] Vision devolvió error: ${raiz.error.status ?? ''} ${raiz.error.message}`);
    return { disponible: false, texto: '', motivo: NO_CONTESTO };
  }

  const primera = raiz.responses?.[0];
  if (!primera) {
    console.error('[CartaOCR] Vision contestó sin ninguna respuesta para la imagen.');
    return { disponible: false, texto: '', motivo: NO_CONTESTO };
  }
  if (primera.error?.message) {
    console.error(`[CartaOCR] Vision rechazó la imagen: ${primera.error.message}`);
    return { disponible: false, texto: '', motivo: NO_CONTESTO };
  }

  // Foto ilegible (oscura, movida, sin texto). El lector SÍ funcionó, así que
  // esto no es una avería: la ruta devolverá cero filas y el portal le dice al
  // dueño cómo repetir la foto. Marcarlo como «no disponible» le haría pensar
  // que el problema es nuestro y esperaría en vez de volver a intentarlo.
  return { disponible: true, texto: primera.fullTextAnnotation?.text ?? '' };
}

/**
 * Google Cloud Vision, `DOCUMENT_TEXT_DETECTION`.
 *
 * `DOCUMENT_TEXT_DETECTION` y no `TEXT_DETECTION`: la segunda está pensada
 * para letreros sueltos y en una carta a dos columnas mezcla los renglones de
 * las dos, que es justo lo que le pegaría el precio de un plato a otro.
 *
 * `languageHints: ['es']` mantiene las tildes y la ñ. Sin ellas, «Patacón»
 * llega como «Patacon» y el dueño tiene que corregir cada plato a mano, que es
 * el trabajo que esto venía a quitar.
 */
async function leerConVision(imagen: ImagenDeCarta, traer: Traer): Promise<TextoDeCarta> {
  const llave = llaveVision();
  if (!llave) {
    console.error(
      '[CartaOCR] CARTA_OCR_PROVIDER=google-vision pero no hay CARTA_OCR_API_KEY '
      + 'ni GOOGLE_MAPS_API_KEY en el entorno.',
    );
    return { disponible: false, texto: '', motivo: APAGADO };
  }

  const cuerpo = {
    requests: [
      {
        image: { content: imagen.bytes.toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['es'] },
      },
    ],
  };

  let res;
  try {
    res = await traer(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(llave)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(ESPERA_MS),
      },
    );
  } catch (err) {
    // Incluye el corte por tiempo: `AbortSignal.timeout` aborta el fetch.
    console.error(`[CartaOCR] no se pudo llamar a Vision: ${err instanceof Error ? err.message : err}`);
    return { disponible: false, texto: '', motivo: NO_CONTESTO };
  }

  if (!res.ok) {
    // 403 es el fallo de estreno más probable: la llave existe pero su
    // proyecto no tiene habilitada Cloud Vision API, o la llave está
    // restringida a las APIs de mapas. Se nombra para no perder una tarde.
    const detalle = await res.text().catch(() => '');
    console.error(
      `[CartaOCR] Vision respondió ${res.status}. ${
        res.status === 403
          ? 'Revisa que Cloud Vision API esté habilitada y que la llave la permita.'
          : ''
      } ${detalle.slice(0, 300)}`,
    );
    return { disponible: false, texto: '', motivo: NO_CONTESTO };
  }

  const json = await res.json().catch(() => null);
  return textoDeRespuestaVision(json);
}

/**
 * Devuelve el texto que se lee en la imagen.
 *
 * `traer` existe solo para las pruebas: en producción es el `fetch` global.
 */
export async function leerTextoDeCarta(
  imagen: ImagenDeCarta,
  traer: Traer = fetch as unknown as Traer,
): Promise<TextoDeCarta> {
  const proveedor = proveedorCarta();

  if (proveedor === 'none') {
    return { disponible: false, texto: '', motivo: APAGADO };
  }

  if (proveedor === 'fake') {
    if (process.env['NODE_ENV'] === 'production') {
      return { disponible: false, texto: '', motivo: APAGADO };
    }
    return { disponible: true, texto: CARTA_DE_PRUEBA };
  }

  if (proveedor === 'google-vision') {
    return leerConVision(imagen, traer);
  }

  // azure-read queda como punto de integración declarado y NO implementado. Se
  // deja el valor admitido porque el día que se contrate la variable ya está
  // escrita en la guía, pero no se finge que funciona: la llamada es
  // `POST {endpoint}/vision/v3.2/read/analyze` con los bytes y
  // `Ocp-Apim-Subscription-Key`, que responde 202 + `Operation-Location` y hay
  // que sondearla hasta `succeeded`; el texto sale de
  // `analyzeResult.readResults[].lines[].text` unidas por '\n'.
  console.error(
    "[CartaOCR] CARTA_OCR_PROVIDER='azure-read' no está implementado. Usa 'google-vision'.",
  );
  return { disponible: false, texto: '', motivo: APAGADO };
}
