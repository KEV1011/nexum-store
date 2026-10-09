'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, Plus, Printer, QrCode, Trash2 } from 'lucide-react'
import { BOTON, ESTADO, TARJETA } from '../../../ui'
import { dibujarQr, useLibreriaQr } from '../../../carta/qr'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

/**
 * Las mesas del local y los QR que se ponen encima de ellas.
 *
 * QUÉ RESUELVE. El comensal escanea el código de SU mesa, ve la carta y pide.
 * La cocina recibe el pedido escrito, con las adiciones y el «sin cebolla» tal
 * como él lo marcó, y sabe a qué mesa llevarlo. Nadie espera a que el mesero
 * pase con la carta ni camina a la cocina con un papel.
 *
 * EL CÓDIGO QUE SE IMPRIME NO ES EL DEL PORTAL. El enlace de esta pantalla
 * (`/carta/<código>`) solo abre la carta. El que el dueño usa para entrar aquí
 * abre el catálogo, los precios y los pedidos: pegarlo en una mesa sería
 * entregarle la administración del local a cualquiera que se siente a almorzar.
 */
/**
 * El código de UNA mesa, pequeño, al lado de su nombre.
 *
 * POR QUÉ. Hasta ahora el QR solo existía en la hoja de imprimir: el dueño
 * creaba «Terraza 2», se iba a imprimir y pegaba en la mesa un código que no
 * había visto nunca. Verlo aquí es lo que permite escanearlo con el propio
 * teléfono y comprobar que abre la carta ANTES de plastificar veinte tarjetas.
 *
 * Sin librería —CDN caído, local con mala conexión— se dibuja el icono y nada
 * más: la pantalla sigue entera y el enlace se copia igual.
 */
function VistaQr({ enlace }: { enlace: string }) {
  const listo = useLibreriaQr()
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!nodo || !listo) return
    dibujarQr(nodo, enlace, 56)
  }, [nodo, listo, enlace])

  return (
    <div
      ref={setNodo}
      aria-hidden
      className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white [&>img]:h-full [&>img]:w-full [&>canvas]:h-full [&>canvas]:w-full"
    >
      {!listo && <QrCode className="h-5 w-5 text-slate-300" />}
    </div>
  )
}

export function MesasManager({ token }: { token: string }) {
  const [mesas, setMesas] = useState<string[]>([])
  const [codigo, setCodigo] = useState('')
  const [nueva, setNueva] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [copiada, setCopiada] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/mesas`, { cache: 'no-store' })
      const json = (await res.json()) as {
        success: boolean
        data?: { menuCode: string; tables: string[] }
        error?: string
      }
      if (!json.success || !json.data) {
        setError(json.error ?? 'No se pudieron cargar las mesas.')
        return
      }
      setMesas(json.data.tables)
      setCodigo(json.data.menuCode)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar(siguiente: string[]) {
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/mesas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: siguiente }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { menuCode: string; tables: string[] }
        error?: string
      }
      if (!json.success || !json.data) {
        // El motivo viene del servidor y dice CUÁL mesa falla («Terraza 1 y
        // terraza 1 son la misma mesa»): un «no se pudo guardar» dejaría al
        // dueño buscando el error entre veinte filas.
        setError(json.error ?? 'No se pudieron guardar las mesas.')
        return
      }
      setMesas(json.data.tables)
      setCodigo(json.data.menuCode)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  function enlaceDe(mesa: string): string {
    const base = typeof window === 'undefined' ? '' : window.location.origin
    return `${base}/carta/${encodeURIComponent(codigo)}?mesa=${encodeURIComponent(mesa)}`
  }

  async function copiar(mesa: string) {
    try {
      await navigator.clipboard.writeText(enlaceDe(mesa))
      setCopiada(mesa)
      setTimeout(() => setCopiada(null), 2000)
    } catch {
      setError('No pudimos copiar el enlace. Selecciónalo y cópialo a mano.')
    }
  }

  function agregar() {
    const etiqueta = nueva.trim()
    if (!etiqueta) return
    setNueva('')
    void guardar([...mesas, etiqueta])
  }

  /** Añade de golpe las mesas 1..n, que es como está numerado casi todo local. */
  function numerar(n: number) {
    const nuevas = Array.from({ length: n }, (_, i) => String(i + 1))
    const faltan = nuevas.filter((m) => !mesas.includes(m))
    if (faltan.length === 0) return
    void guardar([...mesas, ...faltan])
  }

  return (
    <section className={`p-4 sm:p-5 ${TARJETA}`}>
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50">
          <QrCode className="h-4 w-4 text-emerald-600" />
        </span>
        Pedido en la mesa
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Pon un código QR en cada mesa. Tus clientes ven la carta, piden desde su
        celular y el pedido te llega aquí con el número de la mesa.
      </p>

      {cargando ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </p>
      ) : (
        <>
          {error && (
            <p className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${ESTADO.problema}`}>
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {guardado && (
            <p className={`mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold ${ESTADO.enCurso}`}>
              <Check className="h-4 w-4" /> Mesas guardadas
            </p>
          )}

          {mesas.length === 0 && (
            <div className={`mt-3 rounded-xl p-3.5 ${ESTADO.nuevo}`}>
              <p className="text-xs font-semibold leading-relaxed">
                Todavía no tienes mesas. Mientras no las agregues, nadie puede
                pedir desde el salón.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[4, 8, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => numerar(n)}
                    disabled={guardando}
                    className={`${BOTON.principal} text-xs`}
                  >
                    Crear mesas 1 a {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Agregar una mesa
              </label>
              <input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
                placeholder="5, Terraza 2, Barra…"
                maxLength={14}
                className="h-11 w-44 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm
                           placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              type="button"
              onClick={agregar}
              disabled={guardando || !nueva.trim()}
              className={BOTON.principal}
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
            {mesas.length > 0 && (
              <a
                href={`/carta/${encodeURIComponent(codigo)}/imprimir`}
                target="_blank"
                rel="noreferrer"
                className={`${BOTON.secundario} ml-auto`}
              >
                <Printer className="h-4 w-4" /> Imprimir los códigos
              </a>
            )}
          </div>

          {mesas.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {mesas.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <VistaQr enlace={enlaceDe(m)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">Mesa {m}</p>
                    {/* El enlace se oculta en el teléfono: es largo, no se
                        puede hacer nada con él —para eso está Copiar— y le
                        quitaba el sitio al nombre de la mesa, que es lo único
                        que el dueño necesita leer de un vistazo. */}
                    <p className="hidden truncate text-[11px] text-slate-400 sm:block">
                      {enlaceDe(m)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiar(m)}
                    aria-label={`Copiar el enlace de la mesa ${m}`}
                    title="Copiar el enlace de esta mesa"
                    className={BOTON.icono}
                  >
                    {copiada === m
                      ? <Check className="h-4 w-4 text-emerald-600" />
                      : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`¿Quitar la mesa ${m}? El código que tenga pegado dejará de servir.`)) return
                      void guardar(mesas.filter((x) => x !== m))
                    }}
                    aria-label={`Quitar la mesa ${m}`}
                    title="Quitar esta mesa"
                    className={`${BOTON.icono} hover:border-red-300 hover:text-red-600`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-slate-400">
            Este enlace solo abre tu carta. El enlace con el que tú entras al
            portal es otro y no debe quedar pegado en ninguna mesa.
          </p>
        </>
      )}
    </section>
  )
}
