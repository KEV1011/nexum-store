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

    // Revalida según el topic del webhook
    if (topic.startsWith('products/')) {
      revalidateTag('products')

      // Si es un producto específico, revalida su handle también
      const body = await req.json().catch(() => null)
      if (body?.handle) revalidateTag(`product-${body.handle}`)
    }

    if (topic.startsWith('collections/')) {
      revalidateTag('collections')
      const body = await req.json().catch(() => null)
      if (body?.handle) revalidateTag(`collection-${body.handle}`)
    }

    return NextResponse.json({ revalidated: true, topic })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
