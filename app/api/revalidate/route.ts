import { revalidateTag } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

// Webhook de Shopify → revalida el cache de Next.js cuando cambia inventario/productos
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-shopify-hmac-sha256')

  // Verificación básica — en Sprint 3 añadir verificación HMAC completa
  if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
  }

  try {
    const topic = req.headers.get('x-shopify-topic') ?? ''

    // Revalida según el topic del webhook.
    // Next 16: revalidateTag exige el perfil de cache como segundo argumento;
    // 'max' expira el tag de inmediato en la siguiente petición.
    if (topic.startsWith('products/')) {
      revalidateTag('products', 'max')

      // Si es un producto específico, revalida su handle también
      const body = await req.json().catch(() => null)
      if (body?.handle) revalidateTag(`product-${body.handle}`, 'max')
    }

    if (topic.startsWith('collections/')) {
      revalidateTag('collections', 'max')
      const body = await req.json().catch(() => null)
      if (body?.handle) revalidateTag(`collection-${body.handle}`, 'max')
    }

    return NextResponse.json({ revalidated: true, topic })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
