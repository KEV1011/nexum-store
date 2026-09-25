'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Plus, XCircle, Loader2, Users, Bus } from 'lucide-react'
import type { OperatorApi } from './api'
import { useMunicipios } from './useMunicipios'
import { SiluetaVehiculo, type TipoVehiculo } from './SiluetaVehiculo'
import CityInput from './CityInput'
import { formatCOP as formatCOP } from '../moneda'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: 'Abierta', cls: 'bg-emerald-100 text-emerald-700' },
  full: { label: 'Llena', cls: 'bg-amber-100 text-amber-700' },
  departed: { label: 'En viaje', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', cls: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
}

interface SeatBookingRow {
  id: string
  passengerName: string
  maskedPhone?: string
  seatsBooked: number
  /** Sillas asignadas. Vacío en las salidas sin numerar. */
  seats?: number[]
  pickupAddress?: string
  notes?: string
  /** El punto donde sube, tal como se lo dijeron al reservar. */
  boardingPoint?: { name: string; time: string; address?: string }
  fareTotal?: number
  discount?: number
  promoCode?: string
  amountToPay?: number
  /** Quién viaja en cada silla. Ausente en las reservas anteriores al campo. */
  passengers?: { tipoDoc: string; documento: string; nombre: string }[]
}

interface TripStop { name: string; order: number }

interface PuntoEmbarque {
  id?: string
  name: string
  time: string
  address?: string
}

interface PooledTripRow {
  stops?: TripStop[]
  id: string
  tripRef: string
  driverName: string
  vehicleDescription: string
  origin: string
  destination: string
  departureTime: string
  totalSeats: number
  availableSeats: number
  farePerSeat: number
  status: string
  bookings?: SeatBookingRow[]
  /** Presente solo en las salidas con silla numerada. */
  seatMap?: { etiqueta: string; tipo?: TipoVehiculo }
  boardingPoints?: PuntoEmbarque[]
}

interface OperatorDriverRow {
  id: string
  name: string
  phone: string
  isVerified: boolean
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

/** Una caja que ya va en la bodega del bus. */
interface EncomiendaEnBodega {
  manifestId: string
  code: string
  orderRef: string | null
  clientName: string
  clientCity: string | null
  bultos: number
  status: string
}

/** Una caja esperando en bodega a que alguien la suba a un bus. */
interface EncomiendaPendiente {
  orderId: string
  orderRef: string
  clientName: string
  destCitySlug: string | null
  businessName?: string | null
  bultos?: number
}

/** Una distribución posible del vehículo, con su mapa ya dibujado. */
interface ConfigSillas {
  izquierda: number
  derecha: number
  filas: number
  frenteIzquierda?: number
  frenteDerecha?: number
  fondoCorrido?: number
  bano?: 'izquierda' | 'derecha'
}

interface Disposicion {
  config: ConfigSillas
  mapa: {
    columnas: number
    sillas: number
    filas: Array<Array<{ tipo: string; numero?: number }>>
  }
}

/**
 * El plano del vehículo en miniatura.
 *
 * Deliberadamente sin números: a este tamaño no se leen, y lo que la empresa
 * está reconociendo es la FORMA de su vehículo — cuántas sillas van a cada
 * lado del pasillo y si el fondo va corrido.
 */
function MapaMini({ mapa }: { mapa: Disposicion['mapa'] }) {
  return (
    <span
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${mapa.columnas}, 7px)` }}
    >
      {mapa.filas.flatMap((fila, f) =>
        fila.map((celda, c) => (
          <span
            key={`${f}-${c}`}
            className={`h-[7px] w-[7px] rounded-[2px] ${
              celda.tipo === 'silla'
                ? 'bg-emerald-500'
                : celda.tipo === 'conductor'
                  ? 'bg-slate-400'
                  : celda.tipo === 'puerta'
                    ? 'bg-slate-300'
                    : ''
            }`}
          />
        )),
      )}
    </span>
  )
}

/** Cómo se lee una disposición en una línea, para confirmar la elegida. */
function descripcionConfig(c: ConfigSillas): string {
  const partes = [`${c.izquierda}+${c.derecha}`, `${c.filas} filas`]
  if (c.fondoCorrido) partes.push(`fondo de ${c.fondoCorrido}`)
  if (c.bano) partes.push('con baño')
  return partes.join(' · ')
}

/**
 * Salidas programadas de la empresa: publica horarios intermunicipales con
 * conductor afiliado, puestos y tarifa. El cliente los ve y reserva en
 * "Cupos compartidos" de la app.
 */
/**
 * Las comodidades que se pueden marcar, sin el baño.
 *
 * Espejo de `backend/src/lib/amenidades.ts`: el backend RECHAZA una clave que
 * no conozca diciendo cuál, así que un desajuste entre las dos listas se ve al
 * primer intento de publicar y no se queda escondido.
 */
const COMODIDADES: Array<[string, string]> = [
  ['aire', 'Aire acondicionado'],
  ['reclinable', 'Silla reclinable'],
  ['usb', 'Cargador USB'],
  ['wifi', 'Wi-Fi'],
  ['tv', 'Pantallas'],
  ['bodega', 'Bodega para equipaje'],
  ['mantas', 'Mantas y almohadas'],
]

export default function SchedulesManager({ api }: { api: OperatorApi }) {
  const [trips, setTrips] = useState<PooledTripRow[]>([])
  const [drivers, setDrivers] = useState<OperatorDriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [driverId, setDriverId] = useState('')
  const { municipios, etiqueta } = useMunicipios()
  const [origin, setOrigin] = useState('pamplona')
  const [dest, setDest] = useState('cucuta')
  const [departure, setDeparture] = useState('')
  const [seats, setSeats] = useState('4')
  // Vehículo con el que viaja. '' = sin numerar, que es como se publicaba
  // antes: se venden cupos sueltos y el pasajero no elige dónde se sienta.
  const [seatType, setSeatType] = useState<'' | 'VAN' | 'BUSETA' | 'BUS'>('')
  const [seatRows, setSeatRows] = useState('5')
  // Cuántos puestos tiene el vehículo DE VERDAD. Es el dato que la empresa
  // sabe de memoria; de cuántas filas de 2+2 se compone, no. Antes había que
  // tantear las filas hasta que el número saliera — y con las capacidades más
  // comunes (una buseta de 19, un bus de 40) no salía nunca, porque el molde
  // fijo del tipo solo daba múltiplos de cuatro más dos.
  const [puestosReales, setPuestosReales] = useState('')
  const [disposiciones, setDisposiciones] = useState<Disposicion[] | null>(null)
  const [buscandoDisp, setBuscandoDisp] = useState(false)
  const [dispError, setDispError] = useState<string | null>(null)
  const [seatConfig, setSeatConfig] = useState<ConfigSillas | null>(null)
  const [fare, setFare] = useState('22000')
  const [notes, setNotes] = useState('')
  // Paradas intermedias ("pasa por"): nombres de lugar, máx. 6.
  const [stops, setStops] = useState<string[]>([])
  const [stopDraft, setStopDraft] = useState('')
  // Qué trae el vehículo. El baño NO está en esta lista: lo pone el plano de
  // sillas, y tenerlo en dos sitios acabaría prometiendo un baño que el dibujo
  // no tiene.
  const [comodidades, setComodidades] = useState<string[]>([])
  // Dónde y a qué hora sube el pasajero. Máx. 6; el backend los ordena por
  // hora y rechaza los que queden a más de tres horas de la salida.
  const [puntos, setPuntos] = useState<PuntoEmbarque[]>([])
  const [puntoNombre, setPuntoNombre] = useState('')
  const [puntoHora, setPuntoHora] = useState('')
  const [puntoDir, setPuntoDir] = useState('')
  // null = sin declarar, y entonces lo deduce el backend del vehículo: las van
  // recogen en casa, las busetas y buses no. Se declara solo si la empresa
  // toca la casilla, para no imponerle un valor que no eligió.
  const [domicilio, setDomicilio] = useState<boolean | null>(null)

  /**
   * Qué disposiciones dan EXACTAMENTE los puestos que declaró la empresa.
   *
   * Si ninguna cuadra se dice, y no se aproxima al número de al lado: ese
   * redondeo es justo el problema que esto viene a corregir — con una silla de
   * más se vende un puesto que no existe, y con una de menos se deja de
   * vender.
   */
  async function buscarDisposiciones() {
    const n = Number(puestosReales)
    if (!seatType || !Number.isFinite(n) || n < 1) return
    setBuscandoDisp(true)
    setDispError(null)
    setDisposiciones(null)
    try {
      const r = await api<{ opciones: Disposicion[] }>(
        `/operator/pool/disposiciones?tipo=${seatType}&sillas=${n}`,
      )
      const opciones = r?.opciones ?? []
      setDisposiciones(opciones)
      if (opciones.length === 0) {
        setDispError(
          `No hay ninguna distribución de ${n} puestos para ese tipo de vehículo. ` +
          'Comprueba el número, o elige otro tipo.',
        )
      }
    } catch (e) {
      setDispError(e instanceof Error ? e.message : 'No se pudieron consultar las distribuciones.')
    } finally {
      setBuscandoDisp(false)
    }
  }

  // La bodega: qué encomiendas lleva cada salida y cuáles hay esperando.
  const [bodegaId, setBodegaId] = useState<string | null>(null)
  const [bodega, setBodega] = useState<EncomiendaEnBodega[]>([])
  const [pendientes, setPendientes] = useState<EncomiendaPendiente[]>([])
  const [bodegaMsg, setBodegaMsg] = useState<string | null>(null)
  const [cargandoBodega, setCargandoBodega] = useState(false)

  /**
   * Abre la bodega de una salida: lo que ya lleva y lo que hay esperando en esa
   * misma ruta. Las dos cosas juntas, porque la decisión del despachador es
   * «¿qué más le cabe a este bus?» y no se puede tomar con media pantalla.
   */
  async function abrirBodega(tripId: string, origen: string, destino: string) {
    if (bodegaId === tripId) { setBodegaId(null); return }
    setBodegaId(tripId)
    setCargandoBodega(true)
    setBodegaMsg(null)
    try {
      const [dentro, esperando] = await Promise.all([
        api<EncomiendaEnBodega[]>(`/operator/pool/${tripId}/encomiendas`),
        api<EncomiendaPendiente[]>(`/operator/encomiendas?origen=${origen}&destino=${destino}`),
      ])
      setBodega(dentro ?? [])
      setPendientes(esperando ?? [])
    } catch (e) {
      setBodegaMsg(e instanceof Error ? e.message : 'No se pudo abrir la bodega.')
    } finally {
      setCargandoBodega(false)
    }
  }

  async function subirEncomienda(tripId: string, orderId: string, origen: string, destino: string) {
    setBodegaMsg(null)
    try {
      await api(`/operator/pool/${tripId}/encomiendas`, {
        method: 'POST', body: JSON.stringify({ orderId }),
      })
      await abrirBodega(tripId, origen, destino)
      setBodegaId(tripId)
    } catch (e) {
      // El backend dice el motivo exacto —ruta distinta, ya va en otro bus— y
      // es lo que el despachador necesita leer con el bus a punto de salir.
      setBodegaMsg(e instanceof Error ? e.message : 'No se pudo subir la encomienda.')
    }
  }

  // Numerar una salida ya publicada: qué salida se está editando y con qué.
  const [numerarId, setNumerarId] = useState<string | null>(null)
  const [numerarTipo, setNumerarTipo] = useState<'VAN' | 'BUSETA' | 'BUS'>('BUSETA')
  const [numerarFilas, setNumerarFilas] = useState('5')
  const [numerando, setNumerando] = useState<string | null>(null)
  // El error de numerar va JUNTO a la fila: el `error` general se pinta arriba
  // del todo, junto a «Publicar salida», y con la lista larga el operador
  // pulsa y no ve nada.
  const [numerarError, setNumerarError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        api<PooledTripRow[]>('/operator/pool'),
        api<OperatorDriverRow[]>('/operator/drivers'),
      ])
      setTrips(Array.isArray(t) ? t : [])
      const list = Array.isArray(d) ? d : []
      setDrivers(list)
      if (list.length > 0 && !driverId) setDriverId(list[0].id)
    } catch {
      /* errores puntuales se muestran al accionar */
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  useEffect(() => { void load() }, [load])

  async function publish() {
    setError(null)
    if (!driverId) { setError('Afiliar primero un conductor (pestaña Conductores).'); return }
    if (origin === dest) { setError('El origen y el destino deben ser diferentes.'); return }
    if (!departure) { setError('Elige fecha y hora de salida.'); return }
    setSaving(true)
    try {
      await api('/operator/pool/publish', {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          origin,
          destination: dest,
          departureTime: new Date(departure).toISOString(),
          // Con vehículo declarado los puestos los pone el mapa de sillas; se
          // manda igual por si el backend aún no tiene la numeración.
          totalSeats: Number(seats),
          farePerSeat: Number(fare),
          ...(seatType
            ? {
                seatType,
                seatRows: Number(seatRows) || undefined,
                // Sin disposición elegida se usa el molde del tipo, como antes.
                ...(seatConfig ? { seatConfig } : {}),
              }
            : {}),
          notes: notes.trim() || undefined,
          amenities: comodidades.length > 0 ? comodidades : undefined,
          boardingPoints: puntos.length > 0 ? puntos : undefined,
          ...(domicilio === null ? {} : { doorToDoor: domicilio }),
          stops: stops.length > 0
            ? stops.map((name, i) => ({ name, order: i }))
            : undefined,
        }),
      })
      setNotes('')
      setDeparture('')
      setStops([])
      setStopDraft('')
      setComodidades([])
      setPuntos([])
      setDomicilio(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar la salida.')
    } finally {
      setSaving(false)
    }
  }

  async function cancel(id: string, pasajeros: number) {
    // Cancelar es irreversible y le llega al pasajero. Sin preguntar, un clic
    // de más en la fila equivocada deja gente sin viaje y sin explicación.
    const aviso = pasajeros > 0
      ? `Vas a cancelar esta salida. ${pasajeros} ${pasajeros === 1 ? 'pasajero ya compró' : 'pasajeros ya compraron'} su puesto y se les avisará. ¿Seguro?`
      : 'Vas a cancelar esta salida. ¿Seguro?'
    if (!confirm(aviso)) return
    setError(null)
    try {
      await api(`/operator/pool/${id}/cancel`, { method: 'POST' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar la salida.')
    }
  }

  // Numerar una salida ya publicada. El backend rechaza si alguien ya compró
  // por cupo (no se le puede asignar una silla que no eligió) y ese motivo se
  // muestra tal cual: es lo único que la empresa puede accionar.
  async function numerar(id: string, tipo: string, filas: string) {
    setNumerarError(null)
    setNumerando(id)
    try {
      await api(`/operator/pool/${id}/numerar`, {
        method: 'POST',
        body: JSON.stringify({ seatType: tipo, seatRows: Number(filas) || undefined }),
      })
      setNumerarId(null)
      await load()
    } catch (e) {
      // El formulario se queda abierto con el motivo debajo: cerrarlo obligaría
      // a volver a elegir el vehículo para leer por qué no se pudo.
      setNumerarError(e instanceof Error ? e.message : 'No se pudo numerar la salida.')
    } finally {
      setNumerando(null)
    }
  }

  const active = trips.filter((t) => t.status === 'open' || t.status === 'full' || t.status === 'departed')
  const past = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled').slice(0, 10)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4 text-emerald-600" />
        <h2 className="font-bold text-slate-900 text-sm">Salidas programadas</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Publica tus horarios intermunicipales: los pasajeros los ven y reservan puestos
        desde la app (Cupos compartidos), a nombre de tu empresa.
      </p>

      {/* Formulario */}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor (afiliado)</span>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            {drivers.length === 0 && <option value="">— Afilia un conductor primero —</option>}
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · {d.phone}{d.isVerified ? '' : ' (sin verificar)'}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha y hora de salida</span>
          <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
        </label>
        <CityInput label="Origen" value={origin} onChange={setOrigin} municipios={municipios} />
        <CityInput label="Destino" value={dest} onChange={setDest} municipios={municipios} />
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Vehículo</span>
          <select
            value={seatType}
            onChange={(e) => setSeatType(e.target.value as typeof seatType)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="">Sin numerar (cupos)</option>
            <option value="VAN">Van · silla numerada</option>
            <option value="BUSETA">Buseta · silla numerada</option>
            <option value="BUS">Bus · silla numerada</option>
          </select>
          {/* La silueta de lo que se acaba de elegir, con los mismos números
              que la app: la empresa ve aquí lo que verá el pasajero allí. */}
          {seatType && (
            <span className="mt-1.5 flex items-center gap-2">
              <SiluetaVehiculo tipo={seatType} alto={20} />
              <span className="text-[10px] text-slate-400">
                Así lo verá el pasajero
              </span>
            </span>
          )}
        </label>
        {seatType ? (
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">
              ¿Cuántos puestos tiene?
            </span>
            <div className="flex gap-1.5">
              <input
                type="number" min={1} max={60} value={puestosReales}
                placeholder="40"
                onChange={(e) => { setPuestosReales(e.target.value); setSeatConfig(null); setDisposiciones(null) }}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm"
              />
              <button
                type="button"
                onClick={buscarDisposiciones}
                disabled={buscandoDisp || !puestosReales}
                className="shrink-0 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-40"
              >
                {buscandoDisp ? '…' : 'Buscar'}
              </button>
            </div>
            <span className="block text-[10px] text-slate-400 mt-1">
              {seatConfig
                ? `Disposición elegida · ${descripcionConfig(seatConfig)}`
                : 'Los puestos los cuenta el mapa de sillas'}
            </span>
          </label>
        ) : (
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">Puestos</span>
            <input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
          </label>
        )}
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Tarifa por puesto (COP)</span>
          <input type="number" min={0} step={500} value={fare} onChange={(e) => setFare(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
      </div>
      <label className="block mb-3">
        <span className="block text-[11px] font-semibold text-slate-500 mb-1">Notas (opcional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Punto de salida, equipaje, paradas…"
          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
      </label>

      {/* Paradas intermedias ("pasa por") */}
      <div className="mb-3">
        <span className="block text-[11px] font-semibold text-slate-500 mb-1">
          Paradas del trayecto (opcional, máx. 6)
        </span>
        <div className="flex gap-2">
          <input
            value={stopDraft}
            onChange={(e) => setStopDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const name = stopDraft.trim()
                if (name && stops.length < 6) { setStops([...stops, name]); setStopDraft('') }
              }
            }}
            placeholder="Ej: Los Patios, Pamplonita…"
            className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const name = stopDraft.trim()
              if (name && stops.length < 6) { setStops([...stops, name]); setStopDraft('') }
            }}
            disabled={!stopDraft.trim() || stops.length >= 6}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
        {stops.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {stops.map((name, i) => (
              <span key={`${name}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-[11px] font-medium">
                {i + 1}. {name}
                <button type="button" onClick={() => setStops(stops.filter((_, j) => j !== i))}
                  className="text-amber-500 hover:text-amber-800" aria-label={`Quitar ${name}`}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* El puerta a puerta es lo que hace que la gente prefiera la van al bus,
          y también lo que un bus de cuarenta no puede ofrecer. Sin tocar nada
          se deduce del vehículo. */}
      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="w-4 h-4 accent-emerald-600"
            checked={domicilio ?? (seatType === '' || seatType === 'VAN')}
            onChange={(e) => setDomicilio(e.target.checked)}
          />
          Recogemos al pasajero en su dirección (puerta a puerta)
        </label>
        <p className="text-[10px] text-slate-400 mt-1 ml-6">
          {domicilio === null
            ? seatType === 'BUSETA' || seatType === 'BUS'
              ? 'Por el vehículo, esta salida sale de la terminal. Márcalo si tu buseta o bus sí recoge en ruta.'
              : 'Por el vehículo, esta salida recoge en casa. Desmárcalo si sale solo de la terminal.'
            : domicilio
              ? 'El pasajero podrá escribir su dirección al reservar.'
              : 'El pasajero solo podrá elegir uno de los puntos de embarque.'}
        </p>
      </div>

      {/* Dónde sube el pasajero, y a qué hora. Es lo que hoy escribía él a mano
          en «dónde te recogen»: aquí lo declara la empresa con su hora, que es
          la que el pasajero tiene que mirar para salir de casa — no la de la
          salida del bus. */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
          Puntos de embarque
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            placeholder="Terminal de Transportes"
            value={puntoNombre}
            maxLength={80}
            onChange={(e) => setPuntoNombre(e.target.value)}
          />
          <input
            className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            type="time"
            value={puntoHora}
            onChange={(e) => setPuntoHora(e.target.value)}
          />
          <input
            className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            placeholder="Dirección (opcional)"
            value={puntoDir}
            maxLength={160}
            onChange={(e) => setPuntoDir(e.target.value)}
          />
          <button
            type="button"
            disabled={!puntoNombre.trim() || !puntoHora || puntos.length >= 6}
            onClick={() => {
              setPuntos([
                ...puntos,
                {
                  name: puntoNombre.trim(),
                  time: puntoHora,
                  ...(puntoDir.trim() ? { address: puntoDir.trim() } : {}),
                },
              ])
              setPuntoNombre('')
              setPuntoHora('')
              setPuntoDir('')
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-40"
          >
            Añadir
          </button>
        </div>
        {puntos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {puntos.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-[12px] text-slate-700">
                <span className="font-semibold">{p.time}</span>
                <span>{p.name}</span>
                {p.address ? <span className="text-slate-400">· {p.address}</span> : null}
                <button
                  type="button"
                  onClick={() => setPuntos(puntos.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Quitar ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">
          Sin puntos declarados, el pasajero escribe a mano dónde lo recogen,
          como hasta ahora.
        </p>
      </div>

      {/* Qué trae el vehículo. Son los chips que el pasajero compara entre dos
          salidas, y por eso el catálogo es cerrado: con texto libre una empresa
          escribiría «A/C» y otra «climatizado», y no habría con qué comparar.
          El baño no está: lo pone el plano de sillas. */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
          Comodidades del vehículo
        </label>
        <div className="flex flex-wrap gap-1.5">
          {COMODIDADES.map(([clave, texto]) => {
            const puesta = comodidades.includes(clave)
            return (
              <button
                key={clave}
                type="button"
                onClick={() =>
                  setComodidades(
                    puesta
                      ? comodidades.filter((c) => c !== clave)
                      : [...comodidades, clave],
                  )
                }
                className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                  puesta
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {texto}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          El baño sale del plano de sillas, no de aquí: así el aviso nunca
          promete lo que el dibujo no tiene.
        </p>
      </div>

      {/* Elegir la disposición VIENDO el dibujo. «2+2, 10 filas, fondo de 4» no
          le dice nada a nadie; el plano del vehículo sí, porque es el mismo que
          va a ver su pasajero. */}
      {dispError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {dispError}
        </p>
      )}
      {disposiciones && disposiciones.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-slate-500 mb-2">
            Elige la que se parece a tu vehículo · {disposiciones.length} de {puestosReales} puestos
          </p>
          <div className="flex flex-wrap gap-2">
            {disposiciones.map((d, i) => {
              const elegida = seatConfig != null && descripcionConfig(seatConfig) === descripcionConfig(d.config)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSeatConfig(d.config)}
                  className={`text-left p-2 rounded-lg border transition-colors ${
                    elegida
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <MapaMini mapa={d.mapa} />
                  <span className="block text-[10px] text-slate-600 mt-1.5 font-medium">
                    {descripcionConfig(d.config)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <button onClick={publish} disabled={saving || drivers.length === 0}
        className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 mb-5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Publicar salida
      </button>

      {/* Listado */}
      {loading ? (
        <p className="text-xs text-slate-400">Cargando salidas…</p>
      ) : active.length === 0 && past.length === 0 ? (
        <p className="text-xs text-slate-400">Aún no has publicado salidas.</p>
      ) : (
        <ul className="space-y-2">
          {[...active, ...past].map((t) => {
            const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.open
            const cancellable = t.status === 'open' || t.status === 'full'
            const bookings = t.bookings ?? []
            const soldSeats = t.totalSeats - t.availableSeats
            const expanded = expandedId === t.id
            return (
              <li key={t.id} className="border border-slate-100 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Bus className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {etiqueta(t.origin)} → {etiqueta(t.destination)}
                      <span className="text-slate-400 font-normal"> · {formatWhen(t.departureTime)}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {t.driverName} · {t.vehicleDescription} · {formatCOP(t.farePerSeat)}/puesto · ref {t.tripRef}
                    </p>
                    {(t.stops?.length ?? 0) > 0 && (
                      <p className="text-[11px] text-amber-700 truncate">
                        Pasa por: {t.stops!.map((s) => s.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  {/* Ocupación desde la óptica del operador: puestos VENDIDOS de
                      los totales (antes mostraba disponibles, que confundía —
                      "4/4" parecía lleno cuando estaba vacío). */}
                  <span
                    title={`${soldSeats} vendidos · ${t.availableSeats} libres`}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${
                      t.availableSeats === 0 ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {soldSeats}/{t.totalSeats} vendidos
                  </span>
                  {t.seatMap && (
                    <span
                      title="El pasajero elige su silla en el plano del vehículo"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-emerald-50 text-emerald-700"
                    >
                      {t.seatMap.tipo && (
                        <SiluetaVehiculo
                          tipo={t.seatMap.tipo}
                          alto={13}
                          cuerpo="#047857"
                          hueco="#ECFDF5"
                        />
                      )}
                      {t.seatMap.etiqueta} numerada
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                  {cancellable && (
                    <button onClick={() => cancel(t.id, bookings.length)} title="Cancelar salida"
                      className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Pasar a silla numerada una salida que se publicó por cupos.
                    Solo mientras nadie haya comprado: quien pagó un cupo no
                    eligió silla, y asignársela sería inventarle el sitio. */}
                {t.status === 'open' && !t.seatMap && bookings.length === 0 && (
                  <div className="mt-2 pl-7">
                    {numerarId === t.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={numerarTipo}
                          onChange={(e) => setNumerarTipo(e.target.value as typeof numerarTipo)}
                          className="text-[11px] border border-slate-200 rounded-lg px-2 py-1"
                        >
                          <option value="VAN">Van</option>
                          <option value="BUSETA">Buseta</option>
                          <option value="BUS">Bus</option>
                        </select>
                        <label className="text-[11px] text-slate-500">
                          Filas{' '}
                          <input
                            type="number" min={2} max={15}
                            value={numerarFilas}
                            onChange={(e) => setNumerarFilas(e.target.value)}
                            className="w-14 text-[11px] border border-slate-200 rounded-lg px-2 py-1"
                          />
                        </label>
                        <button
                          onClick={() => numerar(t.id, numerarTipo, numerarFilas)}
                          disabled={numerando === t.id}
                          className="text-[11px] font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-lg disabled:opacity-50"
                        >
                          {numerando === t.id ? 'Numerando…' : 'Numerar'}
                        </button>
                        <button
                          onClick={() => { setNumerarId(null); setNumerarError(null) }}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Cancelar
                        </button>
                        {numerarError && (
                          <p className="basis-full text-[11px] text-red-600">{numerarError}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setNumerarId(t.id); setNumerarError(null) }}
                        className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700"
                      >
                        Numerar sillas…
                      </button>
                    )}
                  </div>
                )}

                {/* Manifiesto de pasajeros: quién reservó, cuántos puestos y
                    dónde recogerlos — el trámite que necesita el operador. */}
                {bookings.length > 0 && (
                  <div className="mt-2 pl-7">
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {expanded ? 'Ocultar pasajeros' : `Ver pasajeros (${bookings.length})`}
                    </button>
                    {expanded && (
                      <ul className="mt-1.5 space-y-1.5">
                        {bookings.map((b) => (
                          <li key={b.id} className="text-[11px] text-slate-600 border-l-2 border-emerald-200 pl-2">
                            <span className="font-semibold text-slate-800">{b.passengerName}</span>
                            {b.seats && b.seats.length > 0 ? (
                              <> · <span className="font-semibold text-emerald-700">
                                {b.seats.length === 1 ? 'Silla' : 'Sillas'} {b.seats.join(', ')}
                              </span></>
                            ) : (
                              <>{' · '}{b.seatsBooked} {b.seatsBooked === 1 ? 'puesto' : 'puestos'}</>
                            )}
                            {b.maskedPhone ? ` · ${b.maskedPhone}` : ''}
                            {b.boardingPoint ? (
                              <span className="block text-slate-500">
                                Sube en: <span className="font-semibold">{b.boardingPoint.name}</span>
                                {' · '}{b.boardingPoint.time}
                                {b.boardingPoint.address ? ` · ${b.boardingPoint.address}` : ''}
                              </span>
                            ) : null}
                            {b.pickupAddress ? <span className="block text-slate-400">Recoge en: {b.pickupAddress}</span> : null}
                            {/* Lo que tiene que cobrar. Sin esto, el conductor
                                le pediría la tarifa completa a quien usó un
                                código de la propia empresa, y la discusión
                                sería en la puerta del bus. */}
                            {b.amountToPay != null ? (
                              <span className="block text-slate-500">
                                Cobrar: <span className="font-semibold text-emerald-700">{formatCOP(b.amountToPay)}</span>
                                {b.discount ? (
                                  <span className="text-amber-700">
                                    {' '}(−{formatCOP(b.discount)} con {b.promoCode})
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            {/* La planilla: quién viaja en cada silla, con su
                                documento. Sin ella el conductor sube con un
                                solo nombre para cuatro personas y no puede
                                contrastar con nada. */}
                            {b.passengers && b.passengers.length > 0 ? (
                              <span className="block text-slate-500">
                                {b.passengers.map((p) => (
                                  <span key={`${p.tipoDoc}-${p.documento}`} className="block">
                                    {p.tipoDoc} {p.documento} · {p.nombre}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              // Se dice, no se rellena con el nombre de la
                              // cuenta: eso inventaría pasajeros que nadie
                              // declaró.
                              <span className="block text-amber-700">
                                Sin datos de los pasajeros (reserva anterior a este campo)
                              </span>
                            )}
                            {b.notes ? <span className="block text-slate-400">Nota: {b.notes}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {/* LA BODEGA. Para una cooperativa esto pesa tanto como el
                    pasaje: el bus ya va y el costo está hundido, así que cada
                    caja es margen casi puro. Solo mientras no haya salido —
                    después la bodega está cerrada y el backend lo rechaza. */}
                {(t.status === 'open' || t.status === 'full') && (
                  <div className="mt-2 pl-7">
                    <button
                      onClick={() => abrirBodega(t.id, t.origin, t.destination)}
                      className="text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                    >
                      {bodegaId === t.id ? 'Ocultar bodega' : 'Encomiendas de esta salida'}
                    </button>

                    {bodegaId === t.id && (
                      <div className="mt-1.5">
                        {bodegaMsg && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1.5">
                            {bodegaMsg}
                          </p>
                        )}
                        {cargandoBodega ? (
                          <p className="text-[11px] text-slate-400">Cargando…</p>
                        ) : (
                          <>
                            {bodega.length === 0 ? (
                              <p className="text-[11px] text-slate-400">La bodega va vacía.</p>
                            ) : (
                              <ul className="space-y-1">
                                {bodega.map((e) => (
                                  <li key={e.manifestId} className="text-[11px] text-slate-600 border-l-2 border-amber-300 pl-2">
                                    <span className="font-semibold text-slate-800">{e.code}</span>
                                    {' · '}{e.clientName}
                                    {e.clientCity ? ` · ${etiqueta(e.clientCity)}` : ''}
                                    {' · '}<span className="font-semibold text-amber-700">
                                      {e.bultos} {e.bultos === 1 ? 'bulto' : 'bultos'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {pendientes.length > 0 && (
                              <div className="mt-2">
                                <p className="text-[10px] font-semibold text-slate-500 mb-1">
                                  Esperando en esta ruta
                                </p>
                                <ul className="space-y-1">
                                  {pendientes.map((p) => (
                                    <li key={p.orderId} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                                      <span className="truncate">
                                        {p.orderRef} · {p.clientName}
                                        {p.businessName ? ` · ${p.businessName}` : ''}
                                      </span>
                                      <button
                                        onClick={() => subirEncomienda(t.id, p.orderId, t.origin, t.destination)}
                                        className="shrink-0 px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-semibold hover:bg-amber-700"
                                      >
                                        Subir al bus
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
