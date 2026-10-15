'use client'

/**
 * Abrir y cerrar la caja del turno.
 *
 * LA PREGUNTA QUE RESPONDE: al final del turno, ¿lo que hay en el cajón es lo
 * que debería? Por eso la pantalla enseña el esperado y pide el contado, y no
 * al revés: si enseñara el esperado DESPUÉS de teclear, el cajero acabaría
 * escribiendo la cifra que le dicen en vez de la que contó, y el arqueo
 * dejaría de medir nada.
 */

import { use, useCallback, useEffect, useState } from 'react'
import {
  Wallet, Lock, Unlock, Loader2, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
} from 'lucide-react'

import { BACKEND_URL } from '../../../backend'
import { formatCOP } from '../../../moneda'
import { BOTON, TARJETA } from '../../../ui'

interface Caja {
  id: string
  numero: number
  openedAt: string
  openedBy: string | null
  openingFloat: number
  closedAt: string | null
  closedBy: string | null
  ventasEfectivo: number
  ventasElectronicas: number
  esperado: number
  countedCash: number | null
  difference: number | null
  veredicto: 'cuadra' | 'sobra' | 'falta' | null
  notes: string | null
  mesasAbiertas: number
  avisos: string[]
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Solo dígitos: el cajero teclea «186000», no «$186.000». */
const soloPesos = (v: string) => Number(v.replace(/[^\d]/g, '') || 0)

export default function CajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [abierta, setAbierta] = useState<Caja | null>(null)
  const [delDia, setDelDia] = useState<Caja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [base, setBase] = useState('')
  const [quienAbre, setQuienAbre] = useState('')
  const [contado, setContado] = useState('')
  const [quienCierra, setQuienCierra] = useState('')
  const [nota, setNota] = useState('')

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/caja`)
      const json = (await res.json()) as {
        success: boolean
        data?: { abierta: Caja | null; delDia: Caja[] }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar la caja.')
        return
      }
      setAbierta(json.data.abierta)
      setDelDia(json.data.delDia)
      setError(null)
    } catch {
      setError('Sin conexión con el servidor.')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => {
    void cargar()
    // La caja no cambia tan rápido como la cocina: lo que se mueve es el
    // esperado, y treinta segundos de retraso ahí no le cuesta nada a nadie.
    const t = setInterval(() => void cargar(), 30000)
    return () => clearInterval(t)
  }, [cargar])

  async function llamar(ruta: string, cuerpo: unknown) {
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/caja/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No se pudo.')
        return false
      }
      await cargar()
      return true
    } catch {
      setError('Sin conexión con el servidor.')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function abrir() {
    if (await llamar('abrir', { openingFloat: soloPesos(base), openedBy: quienAbre.trim() })) {
      setBase('')
      setQuienAbre('')
    }
  }

  async function cerrar() {
    const c = soloPesos(contado)
    const dif = c - (abierta?.esperado ?? 0)
    // Confirmar con la DIFERENCIA ya calculada: es el número que importa y
    // el que el cajero tiene que reconocer antes de firmar el turno.
    const texto = dif === 0
      ? 'La caja cuadra exacta.'
      : dif > 0
        ? `Sobran ${formatCOP(dif)}.`
        : `Faltan ${formatCOP(Math.abs(dif))}.`
    if (!window.confirm(
      `Contaste ${formatCOP(c)}\nDeberían ser ${formatCOP(abierta?.esperado ?? 0)}\n\n${texto}\n\n¿Cerrar el turno?`,
    )) return

    if (await llamar('cerrar', {
      countedCash: c, closedBy: quienCierra.trim(), notes: nota.trim(),
    })) {
      setContado('')
      setQuienCierra('')
      setNota('')
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Wallet className="h-6 w-6 text-emerald-600" />
        <h1 className="text-lg font-bold text-slate-900">Caja</h1>
        <a href={`/negocio/${token}`} className={`${BOTON.secundario} ml-auto`}>
          Volver al portal
        </a>
      </header>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {cargando && (
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {!cargando && !abierta && (
        <section className={TARJETA}>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Unlock className="h-4 w-4 text-emerald-600" /> Abrir la caja
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cuenta el sencillo con el que arrancas. Es la base contra la que se
            compara al cerrar.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Base en el cajón
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                inputMode="numeric"
                placeholder="50000"
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Quién abre (opcional)
              <input
                value={quienAbre}
                onChange={(e) => setQuienAbre(e.target.value)}
                placeholder="Nombre"
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </label>
          </div>
          <button type="button" onClick={() => void abrir()} disabled={ocupado} className={`${BOTON.principal} mt-3`}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir caja'}
          </button>
        </section>
      )}

      {abierta && (
        <section className={TARJETA}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Caja {abierta.numero} abierta
            </h2>
            <span className="text-xs text-slate-500">
              desde las {hora(abierta.openedAt)}
              {abierta.openedBy && ` · ${abierta.openedBy}`}
            </span>
          </div>

          <dl className="mt-3 space-y-1 text-sm">
            <Fila etiqueta="Base" valor={abierta.openingFloat} />
            <Fila etiqueta="Cobrado en efectivo" valor={abierta.ventasEfectivo} />
            <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
              <dt>Debería haber en el cajón</dt>
              <dd className="tabular-nums">{formatCOP(abierta.esperado)}</dd>
            </div>
            {/* Lo electrónico va APARTE y con su explicación: no está en el
                cajón, y sumarlo daría un faltante enorme todos los días. */}
            <div className="flex justify-between pt-2 text-xs text-slate-500">
              <dt>Cobrado por otros medios (no está en el cajón)</dt>
              <dd className="tabular-nums">{formatCOP(abierta.ventasElectronicas)}</dd>
            </div>
          </dl>

          {abierta.avisos.map((a) => (
            <p key={a} className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {a}
            </p>
          ))}

          <h3 className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Lock className="h-4 w-4" /> Cerrar el turno
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Efectivo que contaste
              <input
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                inputMode="numeric"
                placeholder="186000"
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Quién cierra (opcional)
              <input
                value={quienCierra}
                onChange={(e) => setQuienCierra(e.target.value)}
                placeholder="Nombre"
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </label>
          </div>
          <label className="mt-2 block text-xs font-semibold text-slate-600">
            Nota (opcional) — por ejemplo, un gasto que salió del cajón
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Se pagó el gas, $30.000"
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void cerrar()}
            disabled={ocupado || contado.trim() === ''}
            className={`${BOTON.principal} mt-3`}
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cerrar caja'}
          </button>
        </section>
      )}

      {delDia.filter((c) => c.closedAt).length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Turnos cerrados hoy</h2>
          <div className="space-y-2">
            {delDia.filter((c) => c.closedAt).map((c) => (
              <article key={c.id} className={TARJETA}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-slate-900">Caja {c.numero}</span>
                  <span className="text-xs text-slate-500">
                    {hora(c.openedAt)} – {hora(c.closedAt!)}
                    {c.closedBy && ` · ${c.closedBy}`}
                  </span>
                  <Veredicto caja={c} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Contó {formatCOP(c.countedCash ?? 0)} de {formatCOP(c.esperado)} esperados
                </p>
                {c.notes && <p className="mt-1 text-xs italic text-slate-600">{c.notes}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between text-slate-700">
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{formatCOP(valor)}</dd>
    </div>
  )
}

/** El faltante se dice con su palabra, no con un signo que se pasa por alto. */
function Veredicto({ caja }: { caja: Caja }) {
  if (caja.veredicto === 'cuadra') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Cuadra
      </span>
    )
  }
  if (caja.veredicto === 'falta') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
        <TrendingDown className="h-3.5 w-3.5" /> Faltan {formatCOP(Math.abs(caja.difference ?? 0))}
      </span>
    )
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
      <TrendingUp className="h-3.5 w-3.5" /> Sobran {formatCOP(caja.difference ?? 0)}
    </span>
  )
}
