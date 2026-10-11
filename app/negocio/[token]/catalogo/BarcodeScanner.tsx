'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Keyboard, X, Check } from 'lucide-react'
import { obtenerLector, type Lector } from './lector-codigos'

/**
 * Escáner de códigos de barras para el catálogo.
 *
 * El lector lo elige `lector-codigos.ts`: la API nativa del navegador cuando
 * está (Android/Chrome) y un lector por JavaScript cuando no (iPhone, Firefox),
 * que es el caso que antes dejaba la cámara sin abrirse. Escribir el código a
 * mano sigue SIEMPRE visible: un código rayado o arrugado no lo lee ninguno de
 * los dos.
 *
 * Escaneo en cadena: tras leer un código la cámara sigue abierta, para cargar
 * muchos productos seguidos sin volver al menú cada vez.
 */

export function BarcodeScanner({
  onDetected,
  onClose,
  ficha,
  aviso,
}: {
  /** Se llama con cada código leído. La cámara sigue abierta para el siguiente. */
  onDetected: (code: string) => void
  onClose: () => void
  /**
   * El alta del producto, SIN salir de la cámara. La monta quien llama con sus
   * propios campos: aquí no se duplica el formulario del catálogo.
   */
  ficha?: React.ReactNode
  /** Confirmación de lo último guardado («… quedó en tu catálogo»). */
  aviso?: string | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cuadroRef = useRef<number | null>(null)
  const esperaRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vivoRef = useRef(true)
  // Evita disparar dos veces el mismo código mientras sigue frente a la cámara.
  const ultimoRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  const [estado, setEstado] = useState<'pidiendo' | 'leyendo' | 'manual'>('pidiendo')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [origen, setOrigen] = useState<Lector['origen'] | null>(null)
  const [manual, setManual] = useState('')
  const [ultimoLeido, setUltimoLeido] = useState<string | null>(null)

  const detener = useCallback(() => {
    vivoRef.current = false
    if (cuadroRef.current !== null) {
      cancelAnimationFrame(cuadroRef.current)
      cuadroRef.current = null
    }
    if (esperaRef.current !== null) {
      clearTimeout(esperaRef.current)
      esperaRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const emitir = useCallback(
    (code: string) => {
      const ahora = Date.now()
      // El mismo código en menos de 2 s es el mismo producto aún encuadrado.
      if (ultimoRef.current.code === code && ahora - ultimoRef.current.at < 2000) return
      ultimoRef.current = { code, at: ahora }
      setUltimoLeido(code)
      // Vibración corta como confirmación física, si el equipo la soporta.
      navigator.vibrate?.(60)
      onDetected(code)
    },
    [onDetected],
  )

  const arrancar = useCallback(async () => {
    const lector = await obtenerLector()
    if (!vivoRef.current) return
    if (!lector) {
      setEstado('manual')
      setMensaje(
        'Tu navegador no puede leer códigos con la cámara. Escribe el código y sigue igual.',
      )
      return
    }
    setOrigen(lector.origen)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      if (!vivoRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setEstado('leyendo')
      setMensaje(null)

      // El siguiente fotograma se pide según lo que aguante el lector: la API
      // nativa va acelerada por el sistema y mira cada fotograma; el lector por
      // JavaScript decodifica en el hilo principal y a cada fotograma trabaría
      // la vista de la cámara justo en el teléfono de gama baja que lo necesita.
      const seguir = (escanear: () => void) => {
        if (!vivoRef.current) return
        if (lector.intervaloMs > 0) {
          esperaRef.current = setTimeout(escanear, lector.intervaloMs)
        } else {
          cuadroRef.current = requestAnimationFrame(escanear)
        }
      }

      const escanear = () => {
        void (async () => {
          const video = videoRef.current
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
              const codigos = await lector.detect(video)
              const valor = codigos[0]?.rawValue?.trim()
              if (valor) emitir(valor)
            } catch {
              // Un fotograma ilegible no es un error: se sigue intentando.
            }
          }
          seguir(escanear)
        })()
      }
      escanear()
    } catch (err) {
      setEstado('manual')
      setMensaje(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'No diste permiso de cámara. Puedes escribir el código a mano.'
          : 'No se pudo abrir la cámara. Escribe el código a mano.',
      )
    }
  }, [emitir])

  useEffect(() => {
    vivoRef.current = true
    void arrancar()
    return detener
  }, [arrancar, detener])

  const enviarManual = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manual.trim()
    if (!code) return
    emitir(code)
    setManual('')
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <span className="font-semibold text-sm">Escanear productos</span>
        </div>
        <button
          onClick={() => { detener(); onClose() }}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-2 gap-3">
        {estado === 'leyendo' || estado === 'pidiendo' ? (
          // Con la ficha del producto en pantalla la cámara se encoge: en un
          // teléfono las dos cosas a tamaño completo no caben y el botón de
          // guardar quedaría fuera de la vista.
          <div
            className={`relative w-full max-w-md shrink-0 rounded-2xl overflow-hidden bg-black ${
              ficha ? 'aspect-[16/7]' : 'aspect-[4/3]'
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guía de encuadre */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-20 border-2 border-emerald-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
        ) : null}

        {mensaje ? (
          <p className="text-amber-200 text-sm text-center max-w-md">{mensaje}</p>
        ) : ficha ? null : (
          <p className="text-slate-300 text-sm text-center">
            Apunta al código de barras del producto.
            {origen === 'zxing' ? ' Acércalo despacio: aquí la lectura tarda un instante más.' : ''}
          </p>
        )}

        {aviso ? (
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold text-center">
            <Check className="w-4 h-4 shrink-0" /> {aviso}
          </div>
        ) : ultimoLeido && !ficha ? (
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <Check className="w-4 h-4" /> Leído: <span className="font-mono">{ultimoLeido}</span>
          </div>
        ) : null}

        {/* El alta sin salir de la cámara. */}
        {ficha}

        {/* Camino manual: siempre disponible, no solo cuando falla la cámara. */}
        <form onSubmit={enviarManual} className="w-full max-w-md flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="…o escribe el código"
            inputMode="numeric"
            maxLength={20}
            className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 flex items-center gap-1.5"
          >
            <Keyboard className="w-4 h-4" /> Usar
          </button>
        </form>
      </div>

      <p className="px-4 pb-5 text-center text-xs text-slate-400">
        Puedes escanear varios seguidos: la cámara queda abierta.
      </p>
    </div>
  )
}
