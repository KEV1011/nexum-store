'use client'

import { useState } from 'react'
import {
  Package,
  Store,
  CheckCircle2,
  Loader2,
  Copy,
  ExternalLink,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────

// Producción (Render) sin NEXT_PUBLIC_BACKEND_URL → backend real, no localhost
// (Next.js hornea este valor en el bundle del navegador en tiempo de build).
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurante / Comida' },
  { value: 'supermarket', label: 'Supermercado / Tienda' },
  { value: 'pharmacy', label: 'Farmacia / Droguería' },
  { value: 'other', label: 'Otro' },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  ownerName: string
  phone: string
  whatsapp: string
  address: string
  category: string
}

interface RegisteredBusiness {
  name: string
  portalUrl: string
}

const EMPTY_FORM: FormState = {
  name: '',
  ownerName: '',
  phone: '',
  whatsapp: '',
  address: '',
  category: 'restaurant',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400 mt-1">{hint}</span> : null}
    </label>
  )
}

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 ' +
  'focus:ring-teal-600/20 transition-colors'

function BenefitRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-teal-700" />
      </div>
      <p className="text-sm text-slate-600">{text}</p>
    </div>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessCard({ business }: { business: RegisteredBusiness }) {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(business.portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard bloqueado (http o permisos): el enlace queda visible para copiar a mano
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-teal-50 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">¡{business.name} está registrado!</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Este es el enlace de tu portal. Desde él verás tus pedidos en tiempo real,
          con evidencia de recogida y entrega.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p className="text-xs font-mono text-slate-700 break-all select-all">{business.portalUrl}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={copyLink}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300
                     bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50
                     transition-colors"
        >
          <Copy className="w-4 h-4" />
          {copied ? '¡Copiado!' : 'Copiar enlace'}
        </button>
        <a
          href={business.portalUrl}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5
                     text-sm font-semibold text-white hover:bg-teal-800 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Abrir portal
        </a>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 leading-relaxed">
          <strong>Guarda este enlace.</strong> Es la única llave de acceso a tu portal:
          cópialo y envíatelo por WhatsApp o guárdalo en favoritos. Si lo pierdes,
          contacta al soporte de ZIPA.
        </p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegistroPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState<RegisteredBusiness | null>(null)

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.ownerName.trim().length >= 2 &&
    form.phone.trim().length >= 7 &&
    form.address.trim().length >= 4 &&
    !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${BACKEND_URL}/business/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          ownerName: form.ownerName.trim(),
          phone: form.phone.trim(),
          whatsapp: form.whatsapp.trim() || undefined,
          address: form.address.trim(),
          category: form.category,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { name: string; portalUrl: string }
        error?: string
      }

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No se pudo completar el registro. Intenta de nuevo.')
        return
      }

      setRegistered({ name: json.data.name, portalUrl: json.data.portalUrl })
    } catch {
      setError('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">ZIPA Delivery</p>
            <p className="text-xs text-slate-400">Registro de negocios</p>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {registered ? (
          <SuccessCard business={registered} />
        ) : (
          <>
            {/* ── Hero ── */}
            <section className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-full
                              px-4 py-1.5 text-teal-700 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Gratis · Sin apps que instalar
              </div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                Registra tu negocio <span className="text-teal-700">en 1 minuto</span>
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                Al terminar recibes el enlace único de tu portal: pedidos en tiempo real,
                evidencia fotográfica de cada entrega y avisos por WhatsApp.
              </p>
            </section>

            {/* ── Form ── */}
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4"
            >
              <Field label="Nombre del negocio">
                <input
                  className={INPUT_CLASS}
                  placeholder="Ej: Restaurante La Esquina"
                  value={form.name}
                  onChange={set('name')}
                  maxLength={80}
                  required
                />
              </Field>

              <Field label="Nombre del dueño o encargado">
                <input
                  className={INPUT_CLASS}
                  placeholder="Ej: María Rodríguez"
                  value={form.ownerName}
                  onChange={set('ownerName')}
                  maxLength={80}
                  required
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Teléfono">
                  <input
                    className={INPUT_CLASS}
                    placeholder="3XX XXX XXXX"
                    value={form.phone}
                    onChange={set('phone')}
                    type="tel"
                    inputMode="tel"
                    maxLength={20}
                    required
                  />
                </Field>
                <Field label="WhatsApp (opcional)" hint="Para avisos automáticos de tus pedidos">
                  <input
                    className={INPUT_CLASS}
                    placeholder="3XX XXX XXXX"
                    value={form.whatsapp}
                    onChange={set('whatsapp')}
                    type="tel"
                    inputMode="tel"
                    maxLength={20}
                  />
                </Field>
              </div>

              <Field label="Dirección del negocio">
                <input
                  className={INPUT_CLASS}
                  placeholder="Ej: Calle 6 #4-21, Centro"
                  value={form.address}
                  onChange={set('address')}
                  maxLength={120}
                  required
                />
              </Field>

              <Field label="Categoría">
                <select className={INPUT_CLASS} value={form.category} onChange={set('category')}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              {error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700
                           px-4 py-3 text-sm font-bold text-white hover:bg-teal-800 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registrando…
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4" />
                    Registrar mi negocio
                  </>
                )}
              </button>
            </form>

            {/* ── Benefits ── */}
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-slate-900 text-sm">¿Qué incluye tu portal?</h2>
              <BenefitRow
                icon={MapPin}
                text="Seguimiento en vivo de cada pedido: pendiente, en recogida, en camino o entregado."
              />
              <BenefitRow
                icon={ShieldCheck}
                text="Cadena de custodia: fotos de recogida y entrega, más firma del cliente."
              />
              <BenefitRow
                icon={MessageCircle}
                text="Avisos automáticos por WhatsApp cuando recogen y entregan — sin instalar nada."
              />
            </section>

            {/* ── Footer ── */}
            <footer className="text-center pb-6">
              <p className="text-xs text-slate-400">ZIPA Delivery · Todos los derechos reservados</p>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
