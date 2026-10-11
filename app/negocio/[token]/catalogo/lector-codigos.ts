'use client'

/**
 * Leer un código de barras con la cámara, en CUALQUIER teléfono.
 *
 * EL DEFECTO QUE CORRIGE. El escáner usaba solo `BarcodeDetector`, la API
 * nativa del navegador. **Safari en iOS no la implementa** —y Firefox
 * tampoco—, así que en un iPhone la cámara nunca llegaba a abrirse: caía
 * directo a «escribe el código a mano», que es exactamente lo que el escáner
 * venía a evitar. El dueño de una tienda en Pamplona está en un iPhone o en un
 * Android de gama baja; decirle que teclee trece dígitos por producto es no
 * tener escáner.
 *
 * POR CDN Y SOLO CUANDO FALTA LA NATIVA, igual que `qrcodejs` en la hoja de
 * códigos QR y Leaflet en los mapas del portal: son ~300 KB que no tiene
 * sentido descargarle a quien lleva Chrome en Android, donde la API nativa ya
 * está y es más rápida.
 *
 * LA VERSIÓN VA FIJADA. Un `@latest` convierte el escáner de la tienda en algo
 * que puede cambiar de comportamiento un martes sin que nadie toque el repo.
 *
 * LOS TRES CAMINOS, en orden, y ninguno deja al dueño encerrado:
 *   1. La API nativa, si está.
 *   2. ZXing por CDN, si no.
 *   3. Escribir el código a mano — que se queda SIEMPRE visible, porque un
 *      código rayado o arrugado no lo lee ningún lector.
 */

const ZXING_CDN =
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'

/** Formatos de los productos de supermercado y farmacia en Colombia. */
export const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf']

/** Lo único que el escáner necesita de un lector, venga de donde venga. */
export interface Lector {
  /** Los códigos que ve en este fotograma. Vacío = ninguno, no es un error. */
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
  /** Cada cuántos ms tiene sentido volver a mirar. */
  intervaloMs: number
  /** De dónde salió, para poder decirlo en pantalla y en un reporte. */
  origen: 'nativo' | 'zxing'
}

interface DetectorNativo {
  detect(src: CanvasImageSource): Promise<Array<{ rawValue?: string }>>
}
interface CtorNativo {
  new (options?: { formats?: string[] }): DetectorNativo
}

function ctorNativo(): CtorNativo | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { BarcodeDetector?: CtorNativo }
  return w.BarcodeDetector ?? null
}

/** Carga el UMD de ZXing una sola vez, aunque se abra el escáner diez veces. */
let cargando: Promise<unknown> | null = null

function cargarZxing(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const w = window as unknown as { ZXing?: unknown }
  if (w.ZXing) return Promise.resolve(w.ZXing)
  if (cargando) return cargando

  cargando = new Promise((resolver, rechazar) => {
    const ya = document.querySelector<HTMLScriptElement>(`script[src="${ZXING_CDN}"]`)
    const s = ya ?? document.createElement('script')
    s.addEventListener('load', () => resolver((window as unknown as { ZXing?: unknown }).ZXing))
    s.addEventListener('error', () => {
      // Se olvida la promesa fallida: con mala conexión, volver a abrir el
      // escáner tiene que poder reintentar en vez de quedarse con el «no».
      cargando = null
      rechazar(new Error('No se pudo cargar el lector de códigos.'))
    })
    if (!ya) {
      s.src = ZXING_CDN
      s.async = true
      document.head.appendChild(s)
    }
  })
  return cargando
}

interface ResultadoZxing { getText(): string }
interface LectorZxing { decodeFromCanvas(c: HTMLCanvasElement): ResultadoZxing }
interface ZxingNS { BrowserMultiFormatReader: new () => LectorZxing }

/**
 * El lector que este navegador puede usar, o `null` si ninguno.
 *
 * `null` NO es un fallo que haya que ocultar: significa «aquí se escribe el
 * código a mano», y quien llama tiene que decirlo con esas palabras.
 */
export async function obtenerLector(): Promise<Lector | null> {
  const Nativo = ctorNativo()
  if (Nativo) {
    const d = new Nativo({ formats: FORMATOS })
    return {
      origen: 'nativo',
      // La nativa va acelerada por el sistema: se puede mirar cada fotograma.
      intervaloMs: 0,
      async detect(video) {
        const r = await d.detect(video)
        return r
          .map((c) => ({ rawValue: (c.rawValue ?? '').trim() }))
          .filter((c) => c.rawValue.length > 0)
      },
    }
  }

  let ns: ZxingNS
  try {
    ns = (await cargarZxing()) as ZxingNS
    if (!ns?.BrowserMultiFormatReader) return null
  } catch {
    return null
  }

  const reader = new ns.BrowserMultiFormatReader()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  return {
    origen: 'zxing',
    // ZXing decodifica en el hilo principal: a cada fotograma trabaría la
    // vista de la cámara en un teléfono de gama baja, que es justo el que
    // necesita este camino. Cinco veces por segundo basta para que se sienta
    // instantáneo al acercar el producto.
    intervaloMs: 200,
    async detect(video) {
      if (!video.videoWidth) return []
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        const texto = reader.decodeFromCanvas(canvas).getText().trim()
        return texto ? [{ rawValue: texto }] : []
      } catch {
        // Un fotograma sin código lanza `NotFoundException`. No es un error:
        // es el caso normal mientras la persona apunta.
        return []
      }
    },
  }
}
