// ── «Se leyó mal»: guardar la carta para volverla una prueba ────────────────
//
// POR QUÉ EXISTE. Cada carta rara que el lector entiende mal se arreglaba
// pidiéndole al dueño una captura y adivinando cómo venía la respuesta del OCR.
// Con la foto y la respuesta tal cual, el admin la descarga y la vuelve una
// prueba (`carta-menus-reales.test.ts` usa justo esa forma), y esa carta deja
// de romperse para siempre.
//
// QUÉ SE GUARDA DE LA RESPUESTA. Vision devuelve un rectángulo por CADA LETRA,
// y eso es lo que pesa megas. El lector solo usa el texto de cada letra y el
// rectángulo y la confianza de cada PALABRA (`palabrasDeRespuestaVision`), así
// que se guarda exactamente eso y nada más: la prueba lee lo mismo que leyó la
// lectura de verdad.

type Vertice = { x?: number; y?: number };

interface PalabraVision {
  boundingBox?: { vertices?: Vertice[] };
  symbols?: Array<{ text?: string }>;
  confidence?: number;
}

/** La respuesta de Vision con solo lo que usa el lector. */
export function compactarRespuestaVision(cuerpo: unknown): unknown {
  const raiz = (cuerpo ?? {}) as {
    responses?: Array<{
      fullTextAnnotation?: {
        text?: string;
        pages?: Array<{ blocks?: Array<{ paragraphs?: Array<{ words?: PalabraVision[] }> }> }>;
      };
    }>;
  };
  const primera = raiz.responses?.[0]?.fullTextAnnotation;
  if (!primera) return null;
  return {
    responses: [{
      fullTextAnnotation: {
        text: primera.text ?? '',
        pages: (primera.pages ?? []).map((pagina) => ({
          blocks: (pagina.blocks ?? []).map((bloque) => ({
            paragraphs: (bloque.paragraphs ?? []).map((parrafo) => ({
              words: (parrafo.words ?? []).map((w) => ({
                boundingBox: { vertices: (w.boundingBox?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 })) },
                symbols: (w.symbols ?? []).map((sym) => ({ text: sym.text ?? '' })),
                ...(typeof w.confidence === 'number' && { confidence: w.confidence }),
              })),
            })),
          })),
        })),
      },
    }],
  };
}

// ── Las lecturas recientes, en memoria ───────────────────────────────────────
//
// El dueño pulsa «Se leyó mal» DESPUÉS de mirar la vista previa, y para
// entonces la respuesta del OCR ya se fue. Se guarda un rato en memoria con
// un código que el portal devuelve: guardarla en la base en cada lectura sería
// escribir megas por una carta que casi nunca se reporta. Si se perdió (un
// reinicio), el reporte se guarda igual, sin la respuesta, y lo dice.

export interface LecturaGuardada {
  businessId: string;
  crudo: unknown;
  lectura: unknown;
  en: number;
}

const DURA_MS = 2 * 60 * 60 * 1000;
const MAX_LECTURAS = 200;
const _lecturas = new Map<string, LecturaGuardada>();

function _podar(ahora: number): void {
  for (const [k, v] of _lecturas) if (ahora - v.en > DURA_MS) _lecturas.delete(k);
  while (_lecturas.size > MAX_LECTURAS) {
    const primera = _lecturas.keys().next().value;
    if (primera === undefined) break;
    _lecturas.delete(primera);
  }
}

export function guardarLectura(id: string, l: Omit<LecturaGuardada, 'en'>, ahora = Date.now()): void {
  _lecturas.set(id, { ...l, en: ahora });
  _podar(ahora);
}

/**
 * La lectura con ese código, solo si es de ESTE negocio: el código viaja por
 * el navegador, y con él otro negocio no puede llevarse la carta de nadie.
 */
export function lecturaDe(id: string, businessId: string, ahora = Date.now()): LecturaGuardada | null {
  _podar(ahora);
  const l = _lecturas.get(id);
  return l && l.businessId === businessId ? l : null;
}

export function olvidarLecturas(): void {
  _lecturas.clear();
}
