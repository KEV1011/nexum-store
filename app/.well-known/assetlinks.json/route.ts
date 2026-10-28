import { assetLinks } from '../../enlaces-app'

/** Android verifica aquí que este dominio autoriza a la app a abrir `/carta/*`. */
export function GET() {
  return Response.json(assetLinks(process.env['ANDROID_APP_LINKS_SHA256']), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
