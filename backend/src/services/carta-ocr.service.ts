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

/**
 * Los únicos valores que encienden algo. Lo que no esté aquí deja el lector
 * APAGADO, nunca a medias: un valor que no entendemos no puede activar un
 * proveedor «parecido».
 */
const PROVEEDORES_VALIDOS: readonly string[] = [
  'none', 'fake', 'google-vision', 'azure-read',
];

function _valorCrudo(): string {
  return (process.env['CARTA_OCR_PROVIDER'] ?? '').trim().toLowerCase();
}

export function proveedorCarta(): ProveedorCarta {
  const p = _valorCrudo();
  if (p === 'fake' || p === 'google-vision' || p === 'azure-read') return p;
  return 'none';
}

/**
 * Hay algo escrito en la variable, pero no es ninguno de los válidos.
 *
 * POR QUÉ ESTO ES UN ESTADO PROPIO Y NO «apagado». Pasó de verdad: la variable
 * estaba puesta como `google-vision3`. El `3` sobraba, no coincidía con nada,
 * el código caía a `none` y `/health` decía `apagado` — exactamente lo mismo
 * que si nunca se hubiera configurado. Desde fuera, «lo puse y no funciona» y
 * «no lo he puesto» se veían idénticos, así que el diagnóstico apuntaba al
 * sitio equivocado (a la llave de Google, que estaba bien).
 *
 * Es el mismo fallo que ya costó dos rondas con `push: firebase` sobre una
 * credencial inválida y con `google-vision-rechazada`: una variable puesta y
 * una ausente no se pueden reportar igual.
 */
export function proveedorNoReconocido(): boolean {
  const p = _valorCrudo();
  return p !== '' && !PROVEEDORES_VALIDOS.includes(p);
}

/**
 * El último valor por el que ya se avisó. Evita repetir el aviso en cada
 * llamada a `/health` —que se consulta a menudo— pero vuelve a avisar si
 * alguien cambia la variable a otra cosa igual de equivocada.
 */
let _avisadoPara: string | null = null;

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
  if (proveedorNoReconocido()) {
    // El valor va al LOG y no a `/health`, que es público: si alguien se
    // equivoca de campo y pega ahí algo que no debía, no lo publicamos. Quien
    // tiene acceso a los registros es quien puede corregir la variable.
    const valor = _valorCrudo();
    if (_avisadoPara !== valor) {
      _avisadoPara = valor;
      console.warn(
        `[CartaOCR] CARTA_OCR_PROVIDER="${valor}" no es un valor válido; el `
        + 'lector queda APAGADO. Valores admitidos: '
        + `${PROVEEDORES_VALIDOS.join(' | ')}.`,
      );
    }
    return 'configuracion-no-reconocida';
  }
  switch (proveedorCarta()) {
    case 'google-vision':
      if (!llaveVision()) return 'google-vision-sin-llave';
      // Configurada y RECHAZANDO es un tercer estado. Sin él, `/health` dice
      // «google-vision» mientras ningún dueño consigue leer una carta, y el
      // diagnóstico apunta al sitio equivocado — el fallo que ya se pagó con
      // `push: firebase` sobre una credencial inválida.
      return _rechazoVision ? 'google-vision-rechazada' : 'google-vision';
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
 * El fallo PERMANENTE, distinto del pasajero.
 *
 * Decirle «inténtalo en un rato» a quien tiene la llave sin permisos es
 * mandarlo a repetir la foto para siempre: por mucho que espere, un 403 no se
 * arregla solo, y el dueño acaba creyendo que su carta no se entiende. Eso
 * fue exactamente lo que se reportó desde producción.
 *
 * Pero tampoco se le nombra la configuración: el dueño de una tienda no
 * administra una cuenta de Google y «habilita Cloud Vision API» no es una
 * instrucción que pueda seguir. Lo único que necesita saber es que **no es
 * culpa de su foto** y qué puede hacer mientras tanto.
 *
 * El detalle accionable va a DOS sitios donde sí lo lee quien puede actuar:
 * el log del servidor y `/health` (`cartaFoto: google-vision-rechazada`).
 */
const SIN_PERMISO =
  'La lectura de cartas no está disponible por una configuración pendiente '
  + 'de ZIPA, no por tu foto. Ya quedó registrado. Mientras tanto puedes '
  + 'cargar tus productos con el archivo CSV o crearlos uno por uno.';

/**
 * Por qué Google rechazó la última lectura, si es que rechazó alguna.
 *
 * Mismo patrón que `_motivoInactivo` de push: `/health` decía «firebase» con
 * solo existir la variable y el diagnóstico mentía. Una variable puesta y un
 * proveedor que rechaza son dos estados distintos, y desde fuera se ven
 * iguales — que es lo que costó una ronda entera de «sigue sin funcionar».
 */
let _rechazoVision: string | null = null;

/** Para las pruebas: vuelve al estado de recién arrancado. */
export function olvidarRechazoCarta(): void {
  _rechazoVision = null;
}

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
    // Vision devuelve 200 con `error.status: PERMISSION_DENIED` cuando la API
    // no está habilitada: mirar solo el código HTTP dejaría este caso —que es
    // el más común al estrenar— clasificado como pasajero.
    const permanente = raiz.error.status === 'PERMISSION_DENIED'
      || raiz.error.status === 'UNAUTHENTICATED';
    if (permanente) {
      _rechazoVision = `${raiz.error.status}: ${raiz.error.message}`;
    }
    return {
      disponible: false,
      texto: '',
      motivo: permanente ? SIN_PERMISO : NO_CONTESTO,
    };
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

  // Vision contestó: el permiso está bien AHORA, diga lo que dijera antes.
  //
  // Sin esto, `_rechazoVision` se encendía al primer 403 y no se apagaba
  // nunca: `/health` seguiría diciendo «google-vision-rechazada» aunque se
  // hubiera habilitado la API y las lecturas ya funcionaran, y solo volvería a
  // la verdad al reiniciar el proceso. Es el mismo defecto que este archivo
  // dice evitar —un estado que miente en una dirección— solo que en la otra,
  // y es peor de lo que parece: quien arregla el permiso en Google Cloud NO
  // reinicia Render, así que miraría el diagnóstico y creería que no sirvió.
  _rechazoVision = null;

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
    // 401/403 es el fallo de estreno más probable: la llave existe pero su
    // proyecto no tiene habilitada Cloud Vision API, o la llave está
    // restringida a las APIs de mapas. Se distingue del fallo pasajero porque
    // NO se arregla esperando, y el mensaje tiene que decir qué tocar.
    const detalle = await res.text().catch(() => '');
    const permanente = res.status === 401 || res.status === 403;
    console.error(
      `[CartaOCR] Vision respondió ${res.status}. ${
        permanente
          ? 'Habilita Cloud Vision API en el proyecto de la llave y revisa sus restricciones.'
          : ''
      } ${detalle.slice(0, 300)}`,
    );
    if (permanente) {
      _rechazoVision = `HTTP ${res.status}: habilita Cloud Vision API en el `
        + 'proyecto de la llave y revisa que no esté restringida a mapas.';
    }
    return {
      disponible: false,
      texto: '',
      motivo: permanente ? SIN_PERMISO : NO_CONTESTO,
    };
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
