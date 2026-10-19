'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Car, Clock, Loader2, MapPin, ShieldCheck } from 'lucide-react'

import { BACKEND_URL } from '../../backend'
import { addTiles, leaflet, loadLeaflet, PAMPLONA, type LLayer, type LMap, type LMarker, type LStatic } from '../../empresa/leaflet'
import { TARJETA } from '../../ui'
import {
  describirVehiculo,
  esTerminal,
  haceCuanto,
  horaColombia,
  trazo,
  type ViajeCompartido,
} from '../seguimiento'

/**
 * Seguimiento de un viaje, para el familiar al que el pasajero le mandó el
 * enlace.
 *
 * POR QUÉ EXISTE. El botón «Compartir viaje» llevaba años copiando un enlace a
 * la API: quien lo abría desde WhatsApp veía una pantalla de código. Ahora abre
 * esto: el carro moviéndose en el mapa, su color y su placa, y la hora a la que
 * llega — lo que de verdad se pregunta quien espera a alguien.
 *
 * Sin cuenta y sin datos de más: ni teléfonos, ni apellidos, ni tarifa. Y el
 * carro solo se dibuja con el viaje en curso y la señal fresca; terminado el
 * viaje, el enlace sigue abriendo pero ya no dice dónde está nadie.
 */

const SONDEO_MS = 10_000

function iconoPunto(L: LStatic, color: string, texto = ''): unknown {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:700 11px/16px system-ui;text-align:center">${texto}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function iconoCarro(L: LStatic): unknown {
  // Un círculo con el carro dibujado en SVG: sin imágenes que puedan no cargar
  // y sin emojis, que cada teléfono pinta distinto.
  return L.divIcon({
    className: '',
    html: `<div style="width:38px;height:38px;border-radius:50%;background:#059669;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 6c-.2-.6-.8-1-1.4-1h-11c-.7 0-1.2.4-1.4 1L3 12v8c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h12v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-8l-2.1-6zM6.5 16c-.8 0-1.5-.7-1.5-1.5S5.7 13 6.5 13s1.5.7 1.5 1.5S7.3 16 6.5 16zm11 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

export default function ViajePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [viaje, setViaje] = useState<ViajeCompartido | null>(null)
  const [error, setError] = useState<'vencido' | 'red' | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/safety/track/${encodeURIComponent(token)}`, {
        cache: 'no-store',
      })
      if (res.status === 404) {
        setError('vencido')
        return
      }
      const body = (await res.json()) as { success?: boolean; data?: ViajeCompartido }
      if (!res.ok || !body.data) {
        setError('red')
        return
      }
      setViaje(body.data)
      setError(null)
    } catch {
      // Un fallo de red no borra lo que ya se estaba viendo: se dice y se
      // reintenta en el siguiente sondeo.
      setError('red')
    }
  }, [token])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Se pregunta mientras el viaje siga vivo; terminado, ya no hay nada nuevo.
  const terminado = viaje ? esTerminal(viaje.status) : false
  useEffect(() => {
    if (terminado) return
    const id = window.setInterval(() => {
      void cargar()
      setAhora(Date.now())
    }, SONDEO_MS)
    return () => window.clearInterval(id)
  }, [cargar, terminado])

  if (!viaje && error === 'vencido') {
    return (
      <Pantalla>
        <div className={`${TARJETA} p-6 text-center`}>
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-lg font-bold text-slate-900">Este enlace ya no está activo</h1>
          <p className="mt-2 text-sm text-slate-600">
            Los enlaces de seguimiento duran seis horas. Pídele a quien te lo mandó que comparta el viaje otra vez.
          </p>
        </div>
      </Pantalla>
    )
  }

  if (!viaje) {
    return (
      <Pantalla>
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          {error === 'red' ? (
            <>
              <AlertTriangle className="h-7 w-7 text-amber-500" />
              <p className="text-sm">No pudimos cargar el viaje. Revisa tu conexión; lo intentamos de nuevo solos.</p>
            </>
          ) : (
            <>
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm">Cargando el viaje…</p>
            </>
          )}
        </div>
      </Pantalla>
    )
  }

  const llegada = horaColombia(viaje.arrivalEstimate)
  const vehiculo = describirVehiculo(viaje.vehicle)
  const senal = haceCuanto(viaje.driverPosition?.at, ahora)
  const nombre = viaje.driverFirstName

  return (
    <Pantalla>
      <MapaViaje viaje={viaje} token={token} />

      <div className={`${TARJETA} mt-4 p-5`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {terminado ? 'Viaje terminado' : 'En vivo'}
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{viaje.statusLabel}</h1>
        {llegada && !terminado && (
          <p className="mt-2 flex items-center gap-2 text-base text-slate-800">
            <Clock className="h-5 w-5 text-slate-500" />
            Llega aproximadamente a las <strong>{llegada}</strong>
          </p>
        )}
        {viaje.status === 'COMPLETED' && horaColombia(viaje.completedAt) && (
          <p className="mt-2 text-sm text-slate-600">Llegó a las {horaColombia(viaje.completedAt)}.</p>
        )}
        {error === 'red' && (
          <p className="mt-2 text-xs text-amber-700">Sin conexión: mostrando lo último que recibimos.</p>
        )}
      </div>

      {(nombre || vehiculo) && (
        <div className={`${TARJETA} mt-3 flex items-center gap-4 p-5`}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <Car className="h-6 w-6 text-slate-600" />
          </div>
          <div className="min-w-0 flex-1">
            {nombre && <p className="text-sm text-slate-600">Conduce <strong className="text-slate-900">{nombre}</strong></p>}
            {vehiculo && <p className="truncate text-sm text-slate-700">{vehiculo}</p>}
            {senal && !terminado && <p className="mt-0.5 text-xs text-slate-500">Ubicación actualizada {senal}</p>}
          </div>
          {viaje.vehicle?.plate && (
            <span className="rounded-md border-2 border-slate-900 bg-amber-300 px-2 py-1 font-mono text-base font-bold tracking-widest text-slate-900">
              {viaje.vehicle.plate}
            </span>
          )}
        </div>
      )}

      <div className={`${TARJETA} mt-3 p-5`}>
        <Fila etiqueta="Desde" texto={viaje.originAddress} color="bg-slate-900" />
        {viaje.stops.map((p, i) => (
          <Fila key={i} etiqueta={`Parada ${i + 1}`} texto={p.name} color="bg-amber-500" />
        ))}
        <Fila etiqueta="Hacia" texto={viaje.destinationAddress} color="bg-emerald-600" ultima />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Si crees que esta persona está en peligro, llama al <a href="tel:123" className="font-bold underline">123</a>.
          Este enlace solo muestra el viaje; no comparte teléfonos ni datos personales.
        </p>
      </div>
    </Pantalla>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto max-w-lg">
        <p className="mb-3 text-sm font-bold tracking-wide text-slate-900">ZIPA · Seguimiento de viaje</p>
        {children}
      </div>
    </main>
  )
}

function Fila({ etiqueta, texto, color, ultima = false }: { etiqueta: string; texto: string; color: string; ultima?: boolean }) {
  return (
    <div className={`flex gap-3 ${ultima ? '' : 'pb-3'}`}>
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{etiqueta}</p>
        <p className="text-sm text-slate-900">{texto}</p>
      </div>
    </div>
  )
}

function MapaViaje({ viaje, token }: { viaje: ViajeCompartido; token: string }) {
  const contenedor = useRef<HTMLDivElement | null>(null)
  const mapa = useRef<LMap | null>(null)
  const carro = useRef<LMarker | null>(null)
  const capas = useRef<Array<LLayer | LMarker>>([])
  const encuadrado = useRef(false)
  const [listo, setListo] = useState(false)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let cancelado = false
    loadLeaflet()
      .then(() => {
        if (cancelado || !contenedor.current || mapa.current) return
        const L = leaflet()
        if (!L) return
        const m = L.map(contenedor.current, { zoomControl: true, attributionControl: false })
        m.setView(PAMPLONA, 13)
        // El enlace compartido sirve de pase para las teselas: es una sesión
        // de solo lectura, y sin él el mapa caería a OpenStreetMap.
        addTiles(L, m, token, BACKEND_URL)
        mapa.current = m
        setListo(true)
      })
      .catch(() => {
        if (!cancelado) setFallo(true)
      })
    return () => {
      cancelado = true
      mapa.current?.remove()
      mapa.current = null
      carro.current = null
      capas.current = []
    }
  }, [token])

  // El trayecto se dibuja una vez: no cambia durante el viaje.
  useEffect(() => {
    if (!listo || !mapa.current) return
    const L = leaflet()
    if (!L) return
    const m = mapa.current
    for (const c of capas.current) c.remove()
    const puntos = trazo(viaje)
    const linea = L.polyline(puntos, { color: '#0f172a', weight: 4, opacity: 0.7, dashArray: '6 8' }).addTo(m)
    const capasNuevas: Array<LLayer | LMarker> = [linea]
    capasNuevas.push(L.marker([viaje.origin.lat, viaje.origin.lng], { icon: iconoPunto(L, '#0f172a') }).addTo(m))
    let n = 0
    for (const p of viaje.stops) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue
      n += 1
      capasNuevas.push(L.marker([p.lat, p.lng], { icon: iconoPunto(L, '#f59e0b', String(n)) }).addTo(m))
    }
    capasNuevas.push(L.marker([viaje.destination.lat, viaje.destination.lng], { icon: iconoPunto(L, '#059669') }).addTo(m))
    capas.current = capasNuevas
    if (!encuadrado.current && puntos.length > 0) {
      encuadrado.current = true
      m.fitBounds(puntos, { padding: [40, 40], maxZoom: 15 })
    }
    // Solo depende de la forma del trayecto, no de cada sondeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, viaje.origin.lat, viaje.origin.lng, viaje.destination.lat, viaje.destination.lng, viaje.stops.length])

  // El carro se mueve con cada sondeo; sin posición fresca, se retira.
  const pos = viaje.driverPosition
  useEffect(() => {
    if (!listo || !mapa.current) return
    const L = leaflet()
    if (!L) return
    if (!pos) {
      carro.current?.remove()
      carro.current = null
      return
    }
    if (carro.current) {
      carro.current.setLatLng([pos.lat, pos.lng])
    } else {
      carro.current = L.marker([pos.lat, pos.lng], { icon: iconoCarro(L) }).addTo(mapa.current)
    }
  }, [listo, pos?.lat, pos?.lng, pos])

  if (fallo) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
        <MapPin className="mr-2 h-4 w-4" /> No se pudo cargar el mapa; el estado del viaje sigue abajo.
      </div>
    )
  }
  return <div ref={contenedor} className="h-72 w-full overflow-hidden rounded-2xl border border-slate-200 bg-[#1f2429] sm:h-96" />
}
