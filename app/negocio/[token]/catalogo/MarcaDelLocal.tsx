'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { BOTON, TARJETA } from '../../../ui'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

const MAX_FOTOS = 6
const LARGO_FRASE = 80

function resolveImg(u?: string | null): string | undefined {
  if (!u) return undefined
  return u.startsWith('http') ? u : `${BACKEND_URL}${u}`
}

interface Info {
  logoUrl?: string
  tagline?: string
  gallery?: string[]
  marca?: { color: string; sobre: string; suave: string }
}

/**
 * La identidad del local dentro de su carta del QR.
 *
 * POR QUÉ IMPORTA Y NO ES DECORACIÓN: en un menú QR el comensal está SENTADO
 * en el restaurante. La marca que manda ahí es la del local, no la nuestra, y
 * una carta idéntica en los veinte locales de la plaza se lee como una
 * plantilla — el dueño lo nota antes que nadie.
 *
 * Las cuatro piezas son opcionales y su ausencia es informativa: sin logo la
 * carta pone la inicial, sin frase no pone nada, sin fotos no dibuja la
 * galería y sin color usa el verde de ZIPA. Nada se rellena con un sustituto
 * bonito.
 */
export function MarcaDelLocal({ token }: { token: string }) {
  const [info, setInfo] = useState<Info>({})
  const [frase, setFrase] = useState('')
  const [color, setColor] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/info`, { cache: 'no-store' })
      const json = (await res.json()) as { success: boolean; data?: Info }
      if (json.success && json.data) {
        setInfo(json.data)
        setFrase(json.data.tagline ?? '')
        setColor(json.data.marca?.color ?? '')
      }
    } catch {
      setError('No pudimos cargar la marca de tu local.')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => { void cargar() }, [cargar])

  async function subir(ruta: string, file: File, cual: string) {
    setOcupado(cual)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BACKEND_URL}/business/${token}/${ruta}`, { method: 'POST', body: fd })
      const json = (await res.json()) as { success: boolean; error?: string }
      // El motivo viene del servidor y dice qué pasó («ya tienes 6 fotos»): un
      // «no se pudo» dejaría al dueño reintentando lo mismo.
      if (!json.success) setError(json.error ?? 'No se pudo subir la imagen.')
      else await cargar()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setOcupado(null)
    }
  }

  async function borrar(ruta: string, cuerpo: unknown, cual: string) {
    setOcupado(cual)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/${ruta}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) setError(json.error ?? 'No se pudo quitar.')
      else await cargar()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setOcupado(null)
    }
  }

  async function guardarMarca() {
    setOcupado('marca')
    setError(null)
    setGuardado(false)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/marca`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagline: frase, brandColor: color || null }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) { setError(json.error ?? 'No se pudo guardar.'); return }
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      await cargar()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setOcupado(null)
    }
  }

  const logo = resolveImg(info.logoUrl)
  const fotos = info.gallery ?? []
  // El color que se está PREVISUALIZANDO: lo que el dueño acaba de elegir,
  // aunque todavía no lo haya guardado. Sin esto tocaría guardar para ver cómo
  // queda, que es justo lo que hace que nadie lo pruebe.
  const previo = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#059669'

  return (
    <section className={`${TARJETA} p-4 sm:p-5`}>
      <h2 className="text-base font-bold tracking-tight text-slate-900">
        La marca de tu local
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Así se ve tu carta cuando un cliente escanea el código de su mesa. Nada
        de esto es obligatorio: lo que no cargues simplemente no aparece.
      </p>

      {cargando ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </p>
      ) : (
        <>
          {error && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {/* ── Logo ───────────────────────────────────────────────────── */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={ocupado !== null}
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl
                         border border-slate-200 bg-slate-50 text-slate-400 hover:border-emerald-300"
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo" className="h-full w-full object-contain p-1" />
              ) : ocupado === 'logo' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Logo</p>
              <p className="text-xs text-slate-500">
                Va junto al nombre, arriba de la carta. Sin logo se muestra la
                inicial de tu local.
              </p>
              {logo && (
                <button
                  type="button"
                  onClick={() => void borrar('logo', {}, 'logo')}
                  disabled={ocupado !== null}
                  className="mt-1 text-xs font-semibold text-red-600 hover:underline"
                >
                  Quitar el logo
                </button>
              )}
            </div>
          </div>
          <input
            ref={logoRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void subir('logo', f, 'logo')
              e.target.value = ''
            }}
          />

          {/* ── Frase ──────────────────────────────────────────────────── */}
          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Una línea sobre tu local
            <input
              value={frase}
              onChange={(e) => setFrase(e.target.value.slice(0, LARGO_FRASE))}
              placeholder="Comida casera desde 1998"
              maxLength={LARGO_FRASE}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5
                         font-normal placeholder:text-slate-400 focus:border-emerald-400
                         focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Va bajo el nombre. {LARGO_FRASE - frase.length} caracteres libres.
            </span>
          </label>

          {/* ── Color ──────────────────────────────────────────────────── */}
          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-800">El color de tu marca</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Tiñe los botones y la cabecera de tu carta. Sin color elegido se
              usa el verde de ZIPA.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                aria-label="Elegir el color de la marca"
                value={previo}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
              />
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#E11D48"
                className="h-11 w-32 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm
                           placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {color && (
                <button
                  type="button"
                  onClick={() => setColor('')}
                  className="text-xs font-semibold text-slate-500 hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
            {/* La muestra enseña el COLOR, no el texto encima.
                No es una omisión: qué letra se lee sobre tu color lo decide el
                servidor con una cuenta de contraste que GARANTIZA que se lea
                —está probada barriendo el espectro—, así que no hay nada que
                previsualizar. Calcularlo aquí además sería tener la misma
                cuenta en dos sitios. */}
            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-inset ring-black/10"
                style={{ background: previo }}
              />
              <p className="text-xs leading-relaxed text-slate-500">
                Tiñe la cabecera y los botones de tu carta. El texto encima se
                ajusta solo —claro u oscuro— para que siempre se lea.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void guardarMarca()}
            disabled={ocupado !== null}
            className={`${BOTON.principal} mt-4 w-full`}
          >
            {ocupado === 'marca'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              : guardado
                ? <><Check className="h-4 w-4" /> Guardado</>
                : 'Guardar frase y color'}
          </button>

          {/* ── Fotos del local ────────────────────────────────────────── */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-800">
              Fotos de tu local
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                {fotos.length} de {MAX_FOTOS}
              </span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              El salón, la parrilla, la terraza. No son las fotos de los platos
              —esas van en cada producto—: son para que se vea tu local.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fotos.map((f) => (
                <div key={f} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImg(f)} alt=""
                    className="h-20 w-28 rounded-xl border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Quitar esta foto"
                    onClick={() => void borrar('fotos', { url: f }, f)}
                    disabled={ocupado !== null}
                    className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full
                               bg-white text-red-600 shadow ring-1 ring-slate-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button
                  type="button"
                  onClick={() => fotoRef.current?.click()}
                  disabled={ocupado !== null}
                  className="grid h-20 w-28 place-items-center gap-1 rounded-xl border-2 border-dashed
                             border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600"
                >
                  {ocupado === 'foto'
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <Camera className="h-5 w-5" />}
                  <span className="text-[11px] font-semibold">Agregar</span>
                </button>
              )}
            </div>
          </div>
          <input
            ref={fotoRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void subir('fotos', f, 'foto')
              e.target.value = ''
            }}
          />
        </>
      )}
    </section>
  )
}
