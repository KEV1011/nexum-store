'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Store, Loader2, ArrowRight, ExternalLink, Copy, Check, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import { ZipaLogo } from '../ZipaLogo'

// Producción (Render) sin NEXT_PUBLIC_BACKEND_URL → backend real, no localhost
// (Next.js hornea este valor en el bundle del navegador en tiempo de build).
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20'

const CATEGORIA: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  SUPERMARKET: 'Supermercado',
  PHARMACY: 'Farmacia',
  OTHER: 'Negocio',
}

interface NegocioLink {
  id: string
  name: string
  category: string
  isOpen: boolean
  portalUrl: string
}

/**
 * Entrada al portal de negocios.
 *
 * El portal es un enlace mágico sin contraseña; hasta ahora, el dueño que
 * perdía ese enlace se quedaba por fuera para siempre y `/negocio` ni siquiera
 * existía (404). Aquí recupera el acceso con el teléfono del registro: un
 * código por SMS prueba que el número es suyo y devuelve sus enlaces.
 */
export default function EntradaNegocio() {
  const [paso, setPaso] = useState<'telefono' | 'codigo' | 'listo'>('telefono')
  const [telefono, setTelefono] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [negocios, setNegocios] = useState<NegocioLink[]>([])
  const [copiado, setCopiado] = useState<string | null>(null)

  const telefonoCompleto = telefono.trim().startsWith('+')
    ? telefono.trim()
    : `+57${telefono.replace(/\D/g, '')}`

  async function enviarCodigo() {
    setError(null)
    setCargando(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/recover/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telefonoCompleto }),
      })
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? 'No se pudo enviar el código.'); return }
      setPaso('codigo')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  async function verificar() {
    setError(null)
    setCargando(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/recover/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telefonoCompleto, otp: codigo.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        data?: { businesses: NegocioLink[] }
      }
      if (!res.ok) { setError(json.error ?? 'Código inválido.'); return }
      setNegocios(json.data?.businesses ?? [])
      setPaso('listo')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(url)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setError('No se pudo copiar. Mantén presionado el enlace para copiarlo.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-700 flex items-center justify-center mb-3">
            <ZipaLogo size={36} animated />
          </div>
          <h1 className="font-bold text-slate-900 text-lg">Portal de Negocios</h1>
          <p className="text-xs text-slate-400">ZIPA · Pedidos y catálogo</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          {paso === 'telefono' && (
            <>
              <h2 className="font-semibold text-slate-900 text-sm mb-1">Entrar a mi negocio</h2>
              <p className="text-xs text-slate-500 mb-4">
                Escribe el teléfono con el que registraste el negocio y te enviamos
                un código para recuperar tu enlace.
              </p>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teléfono</label>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) void enviarCodigo() }}
                placeholder="3001234567"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={INPUT}
              />
              <button
                onClick={() => void enviarCodigo()}
                disabled={cargando || telefono.replace(/\D/g, '').length < 10}
                className="mt-4 w-full py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enviarme el código
              </button>
            </>
          )}

          {paso === 'codigo' && (
            <>
              <h2 className="font-semibold text-slate-900 text-sm mb-1">Escribe el código</h2>
              <p className="text-xs text-slate-500 mb-4">
                Lo enviamos por SMS a <span className="font-semibold text-slate-700">{telefonoCompleto}</span>.
              </p>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && codigo.length === 6 && !cargando) void verificar() }}
                placeholder="••••••"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                className={`${INPUT} text-center text-lg tracking-[0.4em]`}
              />
              <button
                onClick={() => void verificar()}
                disabled={cargando || codigo.length < 6}
                className="mt-4 w-full py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Ver mis negocios
              </button>
              <button
                onClick={() => { setPaso('telefono'); setCodigo(''); setError(null) }}
                className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600"
              >
                Cambiar número
              </button>
            </>
          )}

          {paso === 'listo' && (
            <>
              {negocios.length === 0 ? (
                <div className="text-center">
                  <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto mb-3" />
                  <p className="font-semibold text-slate-800 text-sm">
                    No encontramos ningún negocio con este número
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Puede que lo hayas registrado con otro teléfono. Si nunca lo
                    registraste, puedes hacerlo ahora — toma un minuto.
                  </p>
                  <Link
                    href="/negocio/registro"
                    className="mt-4 inline-flex items-center justify-center gap-2 w-full py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800"
                  >
                    Registrar mi negocio <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => { setPaso('telefono'); setCodigo(''); setError(null) }}
                    className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600"
                  >
                    Probar con otro número
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    {negocios.length === 1 ? 'Tu negocio' : 'Tus negocios'}
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Guarda el enlace en los favoritos de tu celular: es tu acceso directo.
                  </p>
                  <ul className="space-y-2.5">
                    {negocios.map((n) => (
                      <li key={n.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                            <Store className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 text-sm truncate">{n.name}</p>
                            <p className="text-xs text-slate-400">
                              {CATEGORIA[n.category] ?? 'Negocio'}
                              {!n.isOpen ? ' · cuenta inactiva' : ''}
                            </p>
                          </div>
                        </div>
                        {n.isOpen ? (
                          <div className="flex gap-2 mt-2.5">
                            <a
                              href={n.portalUrl}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800"
                            >
                              Entrar <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => void copiar(n.portalUrl)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              {copiado === n.portalUrl
                                ? <><Check className="w-3.5 h-3.5 text-teal-600" /> Copiado</>
                                : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            Esta cuenta está desactivada. Escríbenos para reactivarla.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>

        {paso !== 'listo' ? (
          <p className="text-center text-xs text-slate-400 mt-4">
            ¿Todavía no tienes negocio registrado?{' '}
            <Link href="/negocio/registro" className="text-teal-600 hover:underline">
              Regístralo aquí
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  )
}
