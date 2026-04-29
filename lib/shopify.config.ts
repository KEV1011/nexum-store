// Configuración central de Shopify — todas las credenciales desde env vars

export const shopifyConfig = {
  clientId:     process.env.SHOPIFY_CLIENT_ID!,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET!,
  storeDomain:  process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? '',
  storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? '',
  adminToken:   process.env.SHOPIFY_ADMIN_API_TOKEN ?? '',
  apiVersion:   '2024-07',
} as const

// Valida que las variables críticas estén presentes en runtime
export function assertShopifyEnv() {
  const missing: string[] = []

  if (!shopifyConfig.storeDomain)     missing.push('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
  if (!shopifyConfig.storefrontToken) missing.push('SHOPIFY_STOREFRONT_ACCESS_TOKEN')

  if (missing.length > 0) {
    throw new Error(
      `[Nexum/Shopify] Variables de entorno faltantes:\n${missing.join('\n')}\n` +
      'Cópialas de .env.local.example a .env.local'
    )
  }
}
