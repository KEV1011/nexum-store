'use client'

import { useCallback, useEffect, useState } from 'react'
import { Chat } from './Chat'
import { codigoDesdeHash } from './codigo-enlace'
import { Direccion } from './Direccion'
import { useViajeEnVivo } from './useViajeEnVivo'
import {
  ApiError,
  borrarToken,
  guardarToken,
  leerToken,
  llamar,
  pesos,
  type MensajeChat,
  type OpcionViaje,
  type OpcionesViaje,
  type Punto,
  type Viaje,
} from './api'

/**
 * Pedir un taxi desde un QR o un enlace, sin instalar nada.
 *
 * Es la puerta de entrada más barata que tenemos: el pasajero escanea, escribe
 * a dónde va y pide. Después sigue el viaje y habla con el conductor por el
 * chat del viaje — el mismo que usan las dos apps, por WebSocket, sin costo
 * por mensaje.
 *
 * DOS FORMAS DE ENTRAR, LAS DOS YA EXISTÍAN:
 *  · con `#<codigo>` en la URL (el enlace que manda el bot de WhatsApp), que
 *    canjea sesión sin pedir ningún código porque Meta ya verificó el número;
 *  · con teléfono + OTP, para quien llega por el QR.
 *
 * El código del enlace va detrás del `#` a propósito: así no llega al
 * servidor, no queda en los registros y no lo ve la vista previa del chat. Se
 * borra de la barra en cuanto se canjea, porque es de un solo uso y dejarlo
 * ahí invita a recargar y ver «ese enlace ya se usó».
 */

type Paso = 'entrando' | 'telefono' | 'codigo' | 'pedir' | 'viaje'

const TERMINADO = new Set(['completed', 'cancelled'])

export default function PedirPage() {
  const [paso, setPaso] = useState<Paso>('entrando')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  // Acceso
  const [telefono, setTelefono] = useState('')
  const [codigo, setCodigo] = useState('')
  const [acepta, setAcepta] = useState(false)

  // Trayecto
  const [origen, setOrigen] = useState<Punto | null>(null)
  const [destino, setDestino] = useState<Punto | null>(null)
  const [origenTexto, setOrigenTexto] = useState('')
  const [destinoTexto, setDestinoTexto] = useState('')
  const [opciones, setOpciones] = useState<OpcionesViaje | null>(null)
  const [categoria, setCategoria] = useState<string | null>(null)
  const [cotizando, setCotizando] = useState(false)

  const [viajeId, setViajeId] = useState<string | null>(null)
  const { viaje, setViaje, mensajes, conectado, enviarMensaje } = useViajeEnVivo(token, viajeId)

  // ── Entrada: enlace mágico, sesión guardada o login ────────────────────────
  useEffect(() => {
    let cancelado = false

    async function entrar() {
      const codigo = codigoDesdeHash(window.location.hash)
      if (codigo) {
        // Se limpia ANTES de canjear: si el canje falla, recargar no debe
        // reintentar un código quemado.
        window.history.replaceState(null, '', window.location.pathname)
        try {
          const r = await llamar<{ token: string; origen: { lat: number; lng: number; etiqueta: string | null } | null }>(
            '/client/auth/magic-link',
            { method: 'POST', body: { code: codigo } },
          )
          if (cancelado) return
          guardarToken(r.token)
          setToken(r.token)
          if (r.origen) {
            // El punto que la persona mandó por WhatsApp hace unos segundos.
            // Manda sobre el GPS: lo eligió para ESTE viaje.
            setOrigen({
              lat: r.origen.lat,
              lng: r.origen.lng,
              direccion: r.origen.etiqueta ?? 'Mi ubicación',
            })
          }
          await continuarConSesion(r.token)
          return
        } catch (e) {
          if (cancelado) return
          // Vencido, ya usado o mal copiado son tres arreglos distintos, y el
          // backend ya los distingue en el mensaje.
          setError(e instanceof Error ? e.message : 'Ese enlace no sirve.')
          setPaso('telefono')
          return
        }
      }

      const guardado = leerToken()
      if (guardado) {
        setToken(guardado)
        await continuarConSesion(guardado)
        return
      }
      setPaso('telefono')
    }

    async function continuarConSesion(t: string) {
      // Si ya tiene un viaje en curso, se vuelve a él: quien recarga la página
      // con el taxi en camino no puede aterrizar en un formulario vacío.
      try {
        const activo = await llamar<Viaje | null>('/client/trips/active', { token: t })
        if (cancelado) return
        if (activo && !TERMINADO.has(activo.status)) {
          setViaje(activo)
          setViajeId(activo.id)
          setPaso('viaje')
          return
        }
      } catch (e) {
        if (cancelado) return
        if (e instanceof ApiError && e.status === 401) {
          borrarToken()
          setToken(null)
          setPaso('telefono')
          return
        }
      }
      if (!cancelado) setPaso('pedir')
    }

    void entrar()
    return () => {
      cancelado = true
    }
  }, [setViaje])

  // ── Ubicación del navegador, solo si no vino en el enlace ──────────────────
  useEffect(() => {
    if (paso !== 'pedir' || origen || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let direccion = 'Mi ubicación'
        try {
          const r = await llamar<{ address?: string } | null>(`/geo/reverse?lat=${lat}&lng=${lng}`)
          if (r?.address) direccion = r.address
        } catch {
          // Sin dirección legible se usa el punto igual: las coordenadas son
          // lo que necesita el despacho, el texto es para que la persona lo lea.
        }
        setOrigen({ lat, lng, direccion })
      },
      // Sin permiso no se insiste ni se inventa un punto: escribe la recogida.
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [paso, origen])

  // ── Cotización ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !origen || !destino) {
      setOpciones(null)
      return
    }
    let cancelado = false
    setCotizando(true)
    const params = new URLSearchParams({
      originLat: String(origen.lat),
      originLng: String(origen.lng),
      destLat: String(destino.lat),
      destLng: String(destino.lng),
    })
    llamar<OpcionesViaje>(`/client/trips/options?${params}`, { token })
      .then((o) => {
        if (cancelado) return
        setOpciones(o)
        // Se preselecciona la primera disponible; si la elegida dejó de estarlo
        // —cambió el destino, se fue el último taxi— no se deja marcada una
        // categoría que ya no se puede pedir.
        setCategoria((actual) => {
          const sigueValida = o.opciones.some((x) => x.categoria === actual && x.disponible)
          if (sigueValida) return actual
          return o.opciones.find((x) => x.disponible)?.categoria ?? null
        })
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No pudimos calcular el precio.')
      })
      .finally(() => {
        if (!cancelado) setCotizando(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, origen, destino])

  // ── Acciones ───────────────────────────────────────────────────────────────
  const mandarCodigo = useCallback(async () => {
    setError(null)
    setCargando(true)
    try {
      await llamar('/client/auth/send-otp', { method: 'POST', body: { phone: telefono.trim() } })
      setPaso('codigo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el código.')
    } finally {
      setCargando(false)
    }
  }, [telefono])

  const verificar = useCallback(async () => {
    setError(null)
    setCargando(true)
    try {
      const r = await llamar<{ token: string }>('/client/auth/verify-otp', {
        method: 'POST',
        body: { phone: telefono.trim(), otp: codigo.trim(), acceptedTerms: acepta },
      })
      guardarToken(r.token)
      setToken(r.token)
      setPaso('pedir')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código incorrecto.')
    } finally {
      setCargando(false)
    }
  }, [telefono, codigo, acepta])

  const pedir = useCallback(async () => {
    if (!token || !categoria) return
    setError(null)
    setCargando(true)
    try {
      const v = await llamar<Viaje>('/client/trips/request', {
        token,
        method: 'POST',
        body: {
          serviceType: categoria,
          originAddress: origen?.direccion ?? origenTexto,
          destinationAddress: destino?.direccion ?? destinoTexto,
          originLat: origen?.lat,
          originLng: origen?.lng,
          destLat: destino?.lat,
          destLng: destino?.lng,
          // El precio lo vuelve a calcular el servidor y descarta lo que mande
          // el navegador. Se envía lo cotizado solo para dejar constancia.
          estimatedFare: opciones?.opciones.find((o) => o.categoria === categoria)?.fare ?? 0,
          distanceKm: opciones?.distanceKm ?? 0,
          etaMinutes: opciones?.durationMinutes ?? 0,
          paymentMethod: 'efectivo',
        },
      })
      setViaje(v)
      setViajeId(v.id)
      setPaso('viaje')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos pedir el viaje.')
    } finally {
      setCargando(false)
    }
  }, [token, categoria, origen, destino, origenTexto, destinoTexto, opciones, setViaje])

  const cancelar = useCallback(async () => {
    if (!token || !viajeId) return
    if (!confirm('¿Cancelar el viaje?')) return
    try {
      await llamar(`/client/trips/${viajeId}/cancel`, { token, method: 'POST' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cancelar.')
      return
    }
    volverAPedir()
  }, [token, viajeId])

  function volverAPedir() {
    setViajeId(null)
    setViaje(null)
    setDestino(null)
    setDestinoTexto('')
    setOpciones(null)
    setPaso('pedir')
  }

  // ── Pantalla ───────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-lg font-black tracking-tight text-emerald-700">ZIPA</span>
          <span className="text-xs text-slate-400">Pide tu viaje</span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5">
            {error}
          </div>
        )}

        {paso === 'entrando' && <p className="text-sm text-slate-500 py-10 text-center">Entrando…</p>}

        {paso === 'telefono' && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h1 className="text-lg font-bold text-slate-800">Tu número</h1>
            <p className="text-xs text-slate-500">
              Te mandamos un código para confirmar que eres tú. Lo usamos solo
              para que el conductor te encuentre.
            </p>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void mandarCodigo()
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+57 300 123 4567"
              className="w-full border border-slate-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => void mandarCodigo()}
              disabled={cargando || telefono.trim().length < 7}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-40"
            >
              {cargando ? 'Enviando…' : 'Continuar'}
            </button>
          </section>
        )}

        {paso === 'codigo' && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h1 className="text-lg font-bold text-slate-800">Escribe el código</h1>
            <p className="text-xs text-slate-500">Lo enviamos a {telefono}.</p>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void verificar()
              }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full border border-slate-300 rounded-xl px-3 py-3 text-2xl tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {/* Clickwrap: no viene marcado, y sin él no se puede continuar
                cuando el backend exige la aceptación. */}
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={acepta}
                onChange={(e) => setAcepta(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Acepto los{' '}
                <a href="/legal/terminos" className="text-emerald-700 underline" target="_blank" rel="noreferrer">
                  Términos
                </a>{' '}
                y la{' '}
                <a href="/legal/privacidad" className="text-emerald-700 underline" target="_blank" rel="noreferrer">
                  Política de Privacidad
                </a>
                .
              </span>
            </label>
            <button
              onClick={() => void verificar()}
              disabled={cargando || codigo.trim().length < 4 || !acepta}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-40"
            >
              {cargando ? 'Verificando…' : 'Entrar'}
            </button>
            <button
              onClick={() => setPaso('telefono')}
              className="w-full text-xs text-slate-400 hover:text-slate-600"
            >
              Cambiar el número
            </button>
          </section>
        )}

        {paso === 'pedir' && (
          <>
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <Direccion
                etiqueta="¿Dónde te recogemos?"
                valor={origen}
                cerca={origen}
                onElegir={setOrigen}
                onTextoLibre={(t) => {
                  setOrigenTexto(t)
                  setOrigen(null)
                }}
              />
              <Direccion
                etiqueta="¿A dónde vas?"
                valor={destino}
                cerca={origen}
                onElegir={setDestino}
                onTextoLibre={(t) => {
                  setDestinoTexto(t)
                  setDestino(null)
                }}
                autoFocus={Boolean(origen)}
              />
            </section>

            {cotizando && <p className="text-xs text-slate-400 text-center">Calculando el precio…</p>}

            {opciones && (
              <section className="space-y-2">
                {opciones.opciones.map((o) => (
                  <Categoria
                    key={o.categoria}
                    opcion={o}
                    elegida={categoria === o.categoria}
                    onElegir={() => setCategoria(o.categoria)}
                  />
                ))}
                <p className="text-[11px] text-slate-400 px-1">
                  {opciones.distanceKm.toFixed(1)} km · {opciones.durationMinutes} min · pago en
                  efectivo al conductor
                </p>
              </section>
            )}

            <button
              onClick={() => void pedir()}
              disabled={cargando || !categoria || !origen || !destino}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-base disabled:opacity-40"
            >
              {cargando
                ? 'Pidiendo…'
                : !origen || !destino
                  ? 'Escribe recogida y destino'
                  : !categoria
                    ? 'No hay vehículos cerca ahora'
                    : 'Pedir viaje'}
            </button>
          </>
        )}

        {paso === 'viaje' && viaje && (
          <EnViaje
            viaje={viaje}
            mensajes={mensajes}
            conectado={conectado}
            onEnviar={enviarMensaje}
            onCancelar={() => void cancelar()}
            onNuevo={volverAPedir}
          />
        )}
      </div>
    </main>
  )
}

// ─── Categoría ────────────────────────────────────────────────────────────────

/**
 * Las categorías sin vehículo cerca se muestran APAGADAS, no se esconden: si
 * desaparecieran, la lista cambiaría de tamaño sola y el pasajero no
 * entendería por qué a veces hay taxi y a veces no.
 */
function Categoria({
  opcion,
  elegida,
  onElegir,
}: {
  opcion: OpcionViaje
  elegida: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={!opcion.disponible}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors ${
        elegida
          ? 'border-emerald-600 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-slate-300'
      } ${opcion.disponible ? '' : 'opacity-45'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">
          {opcion.nombre}
          {opcion.cheapest && opcion.disponible && (
            <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
              Más barato
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-400">
          {opcion.disponible
            ? `${opcion.availableNearby} cerca${opcion.etaMinutes != null ? ` · ${opcion.etaMinutes} min` : ''}`
            : 'Sin vehículos ahora'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-black text-slate-900">{pesos(opcion.fare)}</p>
        {/* La tarifa del taxi la fija el decreto municipal, no nosotros. Decirlo
            evita la discusión de «por qué me cobran esto». */}
        {opcion.regulada && <p className="text-[10px] text-slate-400">Tarifa autorizada</p>}
      </div>
    </button>
  )
}

// ─── Viaje en curso ───────────────────────────────────────────────────────────

const ESTADO: Record<string, string> = {
  scheduled: 'Reservado',
  searching: 'Buscando conductor…',
  accepted: 'Conductor asignado',
  arriving: 'Va en camino',
  arrived: 'Llegó a la recogida',
  in_progress: 'En viaje',
  completed: 'Viaje terminado',
  cancelled: 'Viaje cancelado',
}

function EnViaje({
  viaje,
  mensajes,
  conectado,
  onEnviar,
  onCancelar,
  onNuevo,
}: {
  viaje: Viaje
  mensajes: MensajeChat[]
  conectado: boolean
  onEnviar: (t: string) => void
  onCancelar: () => void
  onNuevo: () => void
}) {
  const terminado = TERMINADO.has(viaje.status)
  const hayConductor = Boolean(viaje.driverName)

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-base font-bold text-slate-800">{ESTADO[viaje.status] ?? viaje.status}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {viaje.originAddress} → {viaje.destinationAddress}
        </p>
        <p className="text-sm font-black text-slate-900 mt-2">
          {pesos(viaje.finalFare ?? viaje.totalPasajero ?? viaje.estimatedFare)}
          <span className="ml-1 text-[11px] font-normal text-slate-400">
            {viaje.finalFare ? 'total' : 'aproximado'}
          </span>
        </p>
      </section>

      {hayConductor && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          {/* Sin foto van las INICIALES, no un muñeco genérico. */}
          {viaje.driverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viaje.driverPhotoUrl}
              alt=""
              className="w-12 h-12 rounded-full object-cover shrink-0"
            />
          ) : (
            <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 font-bold grid place-items-center shrink-0">
              {viaje.driverName?.trim().charAt(0).toUpperCase() ?? '?'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800 truncate">
              {viaje.driverName}
              {/* La calificación solo si existe: cinco estrellas vacías se leen
                  como «malo», que no es «todavía nadie lo ha calificado». */}
              {typeof viaje.driverRating === 'number' && (
                <span className="ml-1.5 text-xs font-semibold text-amber-600">
                  {viaje.driverRating.toFixed(1)}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {[viaje.vehicleColor, viaje.vehicleBrand, viaje.vehicleModel]
                .filter(Boolean)
                .join(' ')}
            </p>
            {viaje.driverVerified && (
              <p className="text-[10px] text-emerald-700 font-semibold">Identidad verificada</p>
            )}
          </div>
          {viaje.vehiclePlate && (
            <span className="shrink-0 border-2 border-slate-800 rounded-md px-2 py-1 font-black tracking-[0.15em] text-slate-900">
              {viaje.vehiclePlate}
            </span>
          )}
        </section>
      )}

      {hayConductor && !terminado && (
        <Chat
          mensajes={mensajes}
          conectado={conectado}
          onEnviar={onEnviar}
          nombreConductor={viaje.driverName ?? 'tu conductor'}
        />
      )}

      {terminado ? (
        <button
          onClick={onNuevo}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold"
        >
          Pedir otro viaje
        </button>
      ) : (
        <button
          onClick={onCancelar}
          className="w-full py-3 border border-red-200 text-red-600 rounded-xl font-semibold"
        >
          Cancelar viaje
        </button>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        Por tu seguridad y la del conductor no mostramos su número. Todo lo que
        necesiten coordinar va por este chat.
      </p>
    </div>
  )
}
