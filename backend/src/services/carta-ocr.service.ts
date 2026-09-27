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

export type ProveedorCarta = 'none' | 'fake' | 'google-vision' | 'azure-read';

export interface TextoDeCarta {
  /** Hubo proveedor y contestó. */
  disponible: boolean;
  texto: string;
  /** Qué decirle al dueño cuando no se pudo. Vacío si salió bien. */
  motivo?: string;
}

export function proveedorCarta(): ProveedorCarta {
  const p = (process.env['CARTA_OCR_PROVIDER'] ?? '').trim().toLowerCase();
  if (p === 'fake' || p === 'google-vision' || p === 'azure-read') return p;
  return 'none';
}

/** Para `/health`: qué está activo, en español. */
export function modoCartaOcr(): string {
  switch (proveedorCarta()) {
    case 'google-vision': return 'google-vision';
    case 'azure-read': return 'azure-read';
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

/**
 * Devuelve el texto que se lee en la imagen.
 *
 * `imagenUrl` es la URL pública que ya dejó `fileToUrl` (R2 o disco): los dos
 * proveedores leen por URL, así que no hace falta reenviar los bytes.
 */
export async function leerTextoDeCarta(imagenUrl: string): Promise<TextoDeCarta> {
  const proveedor = proveedorCarta();

  if (proveedor === 'none') {
    return {
      disponible: false,
      texto: '',
      motivo: 'La lectura de cartas por foto todavía no está activada en esta cuenta. '
        + 'Puedes cargar tus productos con el archivo CSV o uno por uno.',
    };
  }

  if (proveedor === 'fake') {
    if (process.env['NODE_ENV'] === 'production') {
      return { disponible: false, texto: '', motivo: 'Lector en modo de pruebas.' };
    }
    return { disponible: true, texto: CARTA_DE_PRUEBA };
  }

  // Punto de integración real. Al implementar, la forma esperada es:
  //
  //   google-vision: POST https://vision.googleapis.com/v1/images:annotate
  //     { requests: [{ image: { source: { imageUri } },
  //                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }
  //     → responses[0].fullTextAnnotation.text
  //
  //   azure-read:    POST {endpoint}/vision/v3.2/read/analyze  (202 + polling)
  //     → analyzeResult.readResults[].lines[].text unidas por '\n'
  //
  // Lo único que tiene que devolver es el texto CON SUS SALTOS DE LÍNEA: el
  // parser se apoya en que cada plato va en su renglón, así que un proveedor
  // que devuelva un párrafo corrido dejaría la carta en una sola fila.
  console.warn(
    `[CartaOCR] proveedor '${proveedor}' sin integración implementada (${imagenUrl.slice(0, 60)}…)`,
  );
  return {
    disponible: false,
    texto: '',
    motivo: 'El lector de cartas está configurado pero no responde. Inténtalo más tarde.',
  };
}
