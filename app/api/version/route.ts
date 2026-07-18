import { NextResponse } from 'next/server'

// Marcador de versión del portal Next.js. Sirve para confirmar QUÉ build corre
// en Render sin adivinar: visita https://<portal>/api/version.
//
// - Si devuelve 404 → el build viejo sigue en vivo (esta ruta aún no existe).
// - Si devuelve 200 con `features.businessSelfRegistration: true` → el portal
//   ya trae el formulario real de /negocio/registro (no el demo).
//
// Render expone RENDER_GIT_COMMIT a cada servicio; en Vercel es
// VERCEL_GIT_COMMIT_SHA. Sin ninguna, 'desconocido' (build local).
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    service: 'ZIPA Portal',
    status: 'ok',
    commit:
      process.env.RENDER_GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      'desconocido',
    features: {
      // /negocio/registro es el formulario de autoregistro real (Tanda 16),
      // no la página informativa con el demo "Sabor Pampero".
      businessSelfRegistration: true,
    },
  })
}
