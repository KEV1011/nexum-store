'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Keyboard, X, Check } from 'lucide-react'

/**
 * Escáner de códigos de barras para el catálogo.
 *
 * Usa `BarcodeDetector`, la API nativa del navegador: no añade dependencias y
 * en Android/Chrome es la misma que usa el sistema. Cuando no existe (Safari,
 * Firefox) se ofrece escribir el código a mano — el dueño nunca queda
 * encerrado sin poder registrar su producto.
 *
 * Escaneo en cadena: tras leer un código la cámara sigue abierta, para cargar
 * muchos productos seguidos sin volver al menú cada vez.
 */

// La API es experimental y aún no está en los tipos de TS.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  return w.BarcodeDetector ?? null
}

/** Formatos de los productos de supermercado y farmacia en Colombia. */
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf']

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  /** Se llama con cada código leído. La cámara sigue abierta para el siguiente. */
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  // Evita disparar dos veces el mismo código mientras sigue frente a la cámara.
  const ultimoRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  const [estado, setEstado] = useState<'pidiendo' | 'leyendo' | 'manual' | 'error'>('pidiendo')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [ultimoLeido, setUltimoLeido] = useState<string | null>(null)

  const detener = useCallback(() => {
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current)
      loopRef.current = null
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
    const Ctor = getDetectorCtor()
    if (!Ctor) {
      setEstado('manual')
      setMensaje(
        'Tu navegador no puede leer códigos con la cámara. Escribe el código y sigue igual.',
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setEstado('leyendo')
      setMensaje(null)

      const detector = new Ctor({ formats: FORMATOS })
      const escanear = async () => {
        const video = videoRef.current
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            const codigos = await detector.detect(video)
            const valor = codigos[0]?.rawValue?.trim()
            if (valor) emitir(valor)
          } catch {
            // Un fotograma ilegible no es un error: se sigue intentando.
          }
        }
        loopRef.current = requestAnimationFrame(() => void escanear())
      }
      void escanear()
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

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
        {estado === 'leyendo' || estado === 'pidiendo' ? (
          <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guía de encuadre */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-24 border-2 border-emerald-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
        ) : null}

        {mensaje ? (
          <p className="text-amber-200 text-sm text-center max-w-md">{mensaje}</p>
        ) : (
          <p className="text-slate-300 text-sm text-center">
            Apunta al código de barras del producto.
          </p>
        )}

        {ultimoLeido ? (
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <Check className="w-4 h-4" /> Leído: <span className="font-mono">{ultimoLeido}</span>
          </div>
        ) : null}

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
