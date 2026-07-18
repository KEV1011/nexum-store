'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

type OperatorType = 'TAXI' | 'INTERCITY' | 'MIXED' | 'CARGA'

const OPERATOR_TYPE_LABEL: Record<OperatorType, string> = {
  TAXI: 'Taxi',
  INTERCITY: 'Intermunicipal',
  MIXED: 'Mixto',
  CARGA: 'Carga',
}

export default function OperatorRegisterPage() {
  const [legalName, setLegalName] = useState('')
  const [nit, setNit] = useState('')
  const [type, setType] = useState<OperatorType>('TAXI')
  // EMPRESA = persona jurídica; PERSONA = dueño natural de varios vehículos
  // (camiones/turbos propios) que administra su flota como una empresa.
  const [kind, setKind] = useState<'EMPRESA' | 'PERSONA'>('EMPRESA')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!legalName.trim() || !nit.trim() || !contactPhone.trim()) {
      setError('Razón social, NIT y teléfono de contacto son obligatorios.')
      return
    }
    const phone = contactPhone.trim().startsWith('+') ? contactPhone.trim() : `+57${contactPhone.replace(/\D/g, '')}`
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/operator/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: legalName.trim(),
          nit: nit.trim(),
          type,
          kind,
          contactName: contactName.trim() || undefined,
          contactPhone: phone,
          contactEmail: contactEmail.trim() || undefined,
          city: city.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || json.success === false) {
        setError(json.error || 'No se pudo registrar la empresa.')
        return
      }
      setDone(true)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="font-bold text-slate-900 text-lg mb-2">Empresa registrada</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tu empresa quedó <strong>pendiente de verificación</strong>. Nuestro equipo revisará
            tu habilitación y documentos. Cuando esté activa, podrás ingresar con el teléfono
            de contacto y administrar tu flota.
          </p>
          <Link
            href="/empresa"
            className="mt-6 inline-block w-full py-2.5 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            Ir al ingreso
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">Registra tu empresa</h1>
            <p className="text-xs text-slate-400">ZIPA · Portal de Empresa</p>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">¿Quién registra?</label>
            <div className="grid grid-cols-2 gap-2">
              {(['EMPRESA', 'PERSONA'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    kind === k
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {k === 'EMPRESA' ? 'Empresa' : 'Persona con vehículos'}
                </button>
              ))}
            </div>
            {kind === 'PERSONA' && (
              <p className="text-xs text-slate-400 mt-1.5">
                Para dueños de camiones, turbos o mulas que administran su propia flota sin sociedad constituida.
              </p>
            )}
          </div>
          <Field
            label={kind === 'PERSONA' ? 'Nombre completo' : 'Razón social'}
            value={legalName}
            onChange={setLegalName}
            placeholder={kind === 'PERSONA' ? 'Juan Pérez' : 'Cooperativa de Transporte...'}
          />
          <Field
            label={kind === 'PERSONA' ? 'Cédula' : 'NIT'}
            value={nit}
            onChange={setNit}
            placeholder={kind === 'PERSONA' ? '1090XXXXXX' : '900123456-7'}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tipo de empresa</label>
            <div className="grid grid-cols-2 gap-2">
              {(['TAXI', 'INTERCITY', 'MIXED', 'CARGA'] as OperatorType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    type === t
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {OPERATOR_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Nombre del contacto" value={contactName} onChange={setContactName} placeholder="Representante legal" />
          <Field label="Teléfono de contacto (ingreso al portal)" value={contactPhone} onChange={setContactPhone} placeholder="3001234567" />
          <Field label="Correo (opcional)" value={contactEmail} onChange={setContactEmail} placeholder="contacto@empresa.com" />
          <Field label="Ciudad" value={city} onChange={setCity} placeholder="Tu ciudad" />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar empresa
          </button>

          <p className="text-center text-xs text-slate-400">
            ¿Ya tienes empresa? <Link href="/empresa" className="text-emerald-600 hover:underline">Ingresa aquí</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
      />
    </div>
  )
}
