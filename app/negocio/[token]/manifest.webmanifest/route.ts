import { BACKEND_URL } from '../../../backend'
import { manifiestoDeNegocio } from '../../pwa'

/**
 * El manifiesto del portal de ESTE negocio: con su nombre bajo el ícono y su
 * enlace como inicio. Un enlace que no es de ningún negocio no se instala.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let nombre = ''
  try {
    const res = await fetch(`${BACKEND_URL}/business/${encodeURIComponent(token)}/info`, {
      next: { revalidate: 300 },
    })
    if (res.status === 404 || res.status === 403) {
      return new Response('Este enlace no es de ningún negocio.', { status: 404 })
    }
    const json = (await res.json()) as { success?: boolean; data?: { name?: string } }
    nombre = json.data?.name ?? ''
  } catch {
    // Sin backend se instala igual, con un nombre genérico: el dueño no tiene
    // por qué quedarse sin su ícono porque el servidor tardó.
  }
  return new Response(JSON.stringify(manifiestoDeNegocio(token, nombre)), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
