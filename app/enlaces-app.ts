// ── Que el QR de la mesa abra la APP si está instalada ──────────────────────
//
// El QR de cada mesa apunta a `https://<portal>/carta/<código>?mesa=N`. Sin
// estos dos archivos, el teléfono lo abre siempre en el navegador. Con ellos,
// Android (App Links) e iPhone (Universal Links) comprueban que el dominio
// autoriza a NUESTRA app y la abren directo en la carta de esa mesa. Si la app
// no está instalada —o si estos archivos no autorizan nada todavía— el QR
// sigue abriendo la web exactamente como hoy: nada se rompe.
//
// LO QUE FALTA PONER (no vive en el código porque depende de llaves):
//   · ANDROID_APP_LINKS_SHA256: la huella SHA-256 del certificado con que se
//     firma la app (la de Play App Signing si se publica en Play, y la del
//     keystore propio para el APK que se instala a mano). Varias, separadas
//     por coma. Sin ella Android no verifica el enlace y abre la web.
//   · APPLE_TEAM_ID: el Team ID de la cuenta Apple Developer. Sin ella, iPhone
//     abre la web. Además hay que activar «Associated Domains» en Xcode.
//
// Sin React ni Next: lo prueba el backend (patrón de `moneda.ts`).

/** El paquete de la app de clientes en Android y su bundle en iOS. */
export const PAQUETE_APP_CLIENTE = 'com.zipa.cliente'

/** Solo estas rutas abren la app: el resto del portal sigue siendo web. */
export const RUTAS_DE_LA_APP = ['/carta/*'] as const

/** Una huella SHA-256 tal como la imprime `keytool`: 32 bytes en hex con «:». */
const HUELLA = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/**
 * Las huellas de la variable de entorno, normalizadas. Una mal escrita se
 * descarta en vez de publicarse: Android rechazaría el archivo ENTERO.
 */
export function huellasValidas(crudo: string | undefined): string[] {
  return (crudo ?? '')
    .split(/[,\s]+/)
    .map((h) => h.trim().toUpperCase())
    .filter((h) => HUELLA.test(h))
}

/** `/.well-known/assetlinks.json` (Android). Sin huellas, lista vacía. */
export function assetLinks(crudo: string | undefined) {
  const huellas = huellasValidas(crudo)
  if (huellas.length === 0) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PAQUETE_APP_CLIENTE,
        sha256_cert_fingerprints: huellas,
      },
    },
  ]
}

/** `/.well-known/apple-app-site-association` (iPhone). Sin equipo, sin apps. */
export function appleAppSiteAssociation(teamId: string | undefined) {
  const equipo = (teamId ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(equipo)) return { applinks: { details: [] } }
  return {
    applinks: {
      details: [
        {
          appIDs: [`${equipo}.${PAQUETE_APP_CLIENTE}`],
          components: RUTAS_DE_LA_APP.map((r) => ({ '/': r })),
        },
      ],
    },
  }
}
