import Link from 'next/link'

/**
 * Documento legal renderizado para la web.
 *
 * Play Console pide una URL pública con la política de privacidad, y hasta
 * ahora lo único que existía era `GET /legal/privacy` del backend, que devuelve
 * JSON. Enviar a un revisor —o a un usuario— a mirar un JSON no es una política
 * publicada.
 *
 * El texto sigue viniendo del backend, que es la fuente versionada: si se
 * publica una versión nueva, esta página la muestra sin tocar el repo. Se
 * renderiza en el servidor y sin caché, para que una versión recién publicada
 * no se quede servida en frío.
 */

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://nexum-api-trxr.onrender.com'

interface LegalDoc {
  kind: string
  version: string
  title: string
  body: string
  publishedAt: string
}

async function cargar(kind: 'terms' | 'privacy'): Promise<LegalDoc | null> {
  try {
    const res = await fetch(`${BACKEND}/legal/${kind}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { success: boolean; data?: LegalDoc }
    return json.data ?? null
  } catch {
    return null
  }
}

function fecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export default async function DocumentoLegal({ kind }: { kind: 'terms' | 'privacy' }) {
  const doc = await cargar(kind)

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <Link
          href="/"
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          ← ZIPA
        </Link>

        {doc === null ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              No pudimos cargar el documento en este momento. Vuelve a intentarlo en
              unos minutos o escríbenos y te lo enviamos por correo.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-2xl sm:text-3xl font-bold tracking-tight">
              {doc.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Versión {doc.version} · Publicada el {fecha(doc.publishedAt)}
            </p>
            {/*
              El cuerpo es texto plano versionado en la base. `whitespace-pre-wrap`
              conserva los saltos y la sangría con que se escribió, sin convertirlo
              en HTML: nada de lo que venga del documento se interpreta como marcado.
            */}
            <article className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
              {doc.body}
            </article>
          </>
        )}

        <hr className="my-10 border-slate-200" />
        <p className="text-xs text-slate-400">
          ¿Quieres eliminar tu cuenta y tus datos?{' '}
          <Link href="/legal/eliminar-cuenta" className="text-emerald-700 font-semibold">
            Cómo hacerlo
          </Link>
        </p>
      </div>
    </main>
  )
}
