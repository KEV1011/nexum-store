'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import TrackMap, { type TrackPoint } from '../../TrackMap'
import type { CargoTrip } from '../../CargoTripsManager'
import { leerToken } from '../../session'

/**
 * Informe final del viaje — lo que se revisa al cerrar cada viaje y entrega.
 *
 * Antes esto vivía repartido entre cuatro pantallas que no se conocían: el
 * viaje en un sitio, el recorrido y los gastos colgando del flete, el remito
 * suelto y el cobro aparte. Desde la unificación el viaje es la unidad, así
 * que todo sale de una sola consulta y se puede imprimir de una vez.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

interface Report {
  trip: CargoTrip
  track: {
    summary: {
      points: number; distanceKm: number; durationMin: number
      stoppedMin: number; avgKmh: number
    }
    points: TrackPoint[]
  }
  events: {
    id: string; type: string; amountCop?: number; gallons?: number
    odometerKm?: number; note?: string; createdAt: string
  }[]
  costs: { fuel: number; toll: number; perdiem: number; maintenance: number; total: number }
  times: {
    toAcceptMin: number | null; waitMin: number | null; transitMin: number | null
    totalMin: number | null; onTime: boolean | null; lateMin: number | null
  }
  delivery: {
    lines: number; declaredItems: number; declaredMeasure: number
    receivedMeasure: number; discrepancies: number; reconciled: number
  }
  cobro: { id: string; number: string; status: string } | null
  costPerKm: number
  margin: number
}

const EVENT_LABEL: Record<string, string> = {
  FUEL: 'Tanqueo', TOLL: 'Peaje', PERDIEM: 'Viático',
  MAINTENANCE: 'Mantenimiento', STOP: 'Parada', NOTE: 'Nota',
}

function cop(n: number | undefined): string {
  if (!n) return '$0'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}
function num(n: number | undefined): string {
  return (n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
}
function dur(min: number | null | undefined): string {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
function fecha(iso?: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export default function InformeViaje() {
  const params = useParams<{ id: string }>()
  const [r, setR] = useState<Report | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = leerToken()
    if (!t) { setError('Abre el portal e inicia sesión para ver el informe.'); return }
    setToken(t)
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/operator/cargo-trips/${params.id}/report`, {
          headers: { Authorization: `Bearer ${t}` }, cache: 'no-store',
        })
        const json = (await res.json()) as { success: boolean; data?: Report; error?: string }
        if (!res.ok || !json.data) { setError(json.error ?? 'No se pudo cargar el informe.'); return }
        setR(json.data)
      } catch {
        setError('No se pudo cargar el informe.')
      }
    })()
  }, [params.id])

  if (error) return <main className="p-8 text-sm text-slate-600">{error}</main>
  if (!r) return <main className="p-8 text-sm text-slate-400">Cargando…</main>

  const t = r.trip
  const origen = [t.originCity, t.originPlace].filter(Boolean).join(' ')

  return (
    <main className="bg-white text-slate-900 mx-auto p-6 print:p-0" style={{ maxWidth: '210mm' }}>
      <div className="mb-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="py-2 px-4 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
        >
          Imprimir o guardar como PDF
        </button>
      </div>

      <header className="mb-4 border-b border-slate-300 pb-3">
        <h1 className="font-bold text-lg">
          Informe del viaje {String(t.number).padStart(2, '0')}
        </h1>
        <p className="text-xs text-slate-600">
          {origen}{t.destCity ? ` → ${t.destCity}` : ''}
          {t.driverName ? ` · ${t.driverName}` : ''}
          {t.vehiclePlate ? ` (${t.vehiclePlate})` : ''}
        </p>
      </header>

      {/* Cifras de cierre: lo que se mira primero. */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Cifra label="Valor del flete" valor={cop(t.freightAmount)} />
        <Cifra label="Gastos de ruta" valor={cop(r.costs.total)} />
        <Cifra label="Margen" valor={cop(r.margin)} rojo={r.margin < 0} />
        <Cifra label="Recorrido real" valor={`${num(r.track.summary.distanceKm)} km`} />
      </section>

      <Bloque titulo="Mercancía y entrega">
        <Fila k="Líneas (destinatarios)" v={String(r.delivery.lines)} />
        <Fila k="Bultos declarados" v={num(r.delivery.declaredItems)} />
        <Fila k="Medida declarada" v={num(r.delivery.declaredMeasure)} />
        {r.delivery.reconciled > 0 && (
          <>
            <Fila k="Medida recibida" v={num(r.delivery.receivedMeasure)} />
            <Fila
              k="Novedades en la entrega"
              v={r.delivery.discrepancies === 0 ? 'Ninguna' : String(r.delivery.discrepancies)}
              alerta={r.delivery.discrepancies > 0}
            />
          </>
        )}
        {r.delivery.reconciled === 0 && (
          <p className="text-[11px] text-slate-500">
            Las líneas todavía no se han conciliado en la entrega.
          </p>
        )}
        <ul className="mt-2 space-y-1">
          {t.lines.map((l) => (
            <li key={l.id} className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">{l.reference || l.code}</span>
              {' · '}{num(l.totalItems)} × {num(l.totalMeasure)}
              {' · '}{l.clientName}{l.clientCity ? ` → ${l.clientCity}` : ''}
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Tiempos">
        <Fila k="Espera en bodega" v={dur(r.times.waitMin)} />
        <Fila k="Tiempo en ruta" v={dur(r.times.transitMin)} />
        <Fila k="Total puerta a puerta" v={dur(r.times.totalMin)} />
        <Fila k="Salida real" v={fecha(t.startedAt)} />
        <Fila k="Entrega" v={fecha(t.completedAt)} />
        {r.times.onTime !== null && (
          <Fila
            k="Cumplimiento"
            v={r.times.onTime ? 'A tiempo' : `Tarde ${dur(r.times.lateMin)}`}
            alerta={!r.times.onTime}
          />
        )}
      </Bloque>

      <Bloque titulo="Recorrido">
        {r.track.points.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Sin rastro GPS para este viaje. Se graba mientras el viaje está despachado.
          </p>
        ) : (
          <>
            <Fila k="Kilómetros reales" v={`${num(r.track.summary.distanceKm)} km`} />
            <Fila k="Duración" v={dur(r.track.summary.durationMin)} />
            <Fila k="Tiempo detenido" v={dur(r.track.summary.stoppedMin)} />
            <Fila k="Promedio en movimiento" v={`${num(r.track.summary.avgKmh)} km/h`} />
            <Fila k="Costo por kilómetro" v={cop(r.costPerKm)} />
            <div className="mt-2 print:hidden">
              <TrackMap points={r.track.points} token={token} backendUrl={BACKEND_URL} />
            </div>
          </>
        )}
      </Bloque>

      <Bloque titulo="Gastos de ruta">
        {r.costs.total === 0 ? (
          <p className="text-[11px] text-slate-500">El conductor no registró gastos en este viaje.</p>
        ) : (
          <>
            <Fila k="Combustible" v={cop(r.costs.fuel)} />
            <Fila k="Peajes" v={cop(r.costs.toll)} />
            <Fila k="Viáticos" v={cop(r.costs.perdiem)} />
            <Fila k="Mantenimiento" v={cop(r.costs.maintenance)} />
            <Fila k="Total" v={cop(r.costs.total)} />
            <ul className="mt-2 space-y-1">
              {r.events.map((e) => (
                <li key={e.id} className="text-[11px] text-slate-600">
                  {fecha(e.createdAt)} · {EVENT_LABEL[e.type] ?? e.type}
                  {e.amountCop ? ` · ${cop(e.amountCop)}` : ''}
                  {e.gallons ? ` · ${e.gallons} gal` : ''}
                  {e.odometerKm ? ` · ${e.odometerKm} km` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloque>

      <Bloque titulo="Cobro">
        {r.cobro ? (
          <Fila
            k={`Cuenta de cobro ${r.cobro.number}`}
            v={r.cobro.status === 'ISSUED' ? 'Emitida' : r.cobro.status === 'VOID' ? 'Anulada' : 'Borrador'}
          />
        ) : (
          <p className="text-[11px] text-slate-500">
            Este viaje todavía no está en ninguna cuenta de cobro.
          </p>
        )}
      </Bloque>
    </main>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="font-bold text-sm border-b border-slate-300 mb-1.5 pb-0.5">{titulo}</h2>
      {children}
    </section>
  )
}

function Fila({ k, v, alerta }: { k: string; v: string; alerta?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-slate-600">{k}</span>
      <span className={`font-semibold ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{v}</span>
    </div>
  )
}

function Cifra({ label, valor, rojo }: { label: string; valor: string; rojo?: boolean }) {
  return (
    <div className="border border-slate-300 rounded p-2">
      <p className={`text-sm font-bold ${rojo ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}
