// Shopify Storefront API Client — Sprint 1
// Cuando el Partner Account esté listo, completar las variables de entorno en .env.local

const SHOPIFY_STORE_DOMAIN  = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!
const SHOPIFY_API_VERSION   = '2024-07'

type ShopifyFetchOptions = {
  query:     string
  variables?: Record<string, unknown>
  tags?:     string[]
  cache?:    RequestCache
}

// ── Core Fetcher ─────────────────────────────────────────────────────────────

async function shopifyFetch<T>({
  query,
  variables,
  tags,
  cache = 'force-cache',
}: ShopifyFetchOptions): Promise<{ status: number; body: T }> {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_TOKEN) {
    throw new Error('[Shopify] Variables de entorno no configuradas. Ver .env.local.example')
  }

  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method:  'POST',
        headers: {
          'Content-Type':                     'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body:  JSON.stringify({ query, variables }),
        cache,
        next:  tags ? { tags } : undefined,
      }
    )

    const body = await res.json()

    if (body.errors) {
      throw new Error(`[Shopify GraphQL] ${JSON.stringify(body.errors)}`)
    }

    return { status: res.status, body: body.data as T }
  } catch (error) {
    throw new Error(`[Shopify Fetch] ${error}`)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopifyProduct = {
  id:          string
  handle:      string
  title:       string
  description: string
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string }
    maxVariantPrice: { amount: string; currencyCode: string }
  }
  compareAtPriceRange: {
    minVariantPrice: { amount: string; currencyCode: string }
  }
  images: { edges: { node: { url: string; altText: string } }[] }
  tags:   string[]
  variants: {
    edges: {
      node: {
        id:                string
        title:             string
        availableForSale:  boolean
        price:             { amount: string; currencyCode: string }
        compareAtPrice?:   { amount: string; currencyCode: string }
        selectedOptions:   { name: string; value: string }[]
      }
    }[]
  }
}

export type ShopifyCollection = {
  id:          string
  handle:      string
  title:       string
  description: string
  image?:      { url: string; altText: string }
  products: { edges: { node: ShopifyProduct }[] }
}

// ── Queries ───────────────────────────────────────────────────────────────────

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    tags
    priceRange {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    compareAtPriceRange {
      minVariantPrice { amount currencyCode }
    }
    images(first: 4) {
      edges { node { url altText } }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          availableForSale
          price             { amount currencyCode }
          compareAtPrice    { amount currencyCode }
          selectedOptions   { name value }
        }
      }
    }
  }
`

// ── API Methods ───────────────────────────────────────────────────────────────

export async function getProducts(first = 12): Promise<ShopifyProduct[]> {
  const { body } = await shopifyFetch<{ products: { edges: { node: ShopifyProduct }[] } }>({
    query: `
      ${PRODUCT_FRAGMENT}
      query GetProducts($first: Int!) {
        products(first: $first, sortKey: BEST_SELLING) {
          edges { node { ...ProductFields } }
        }
      }
    `,
    variables: { first },
    tags: ['products'],
  })
  return body.products.edges.map(e => e.node)
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const { body } = await shopifyFetch<{ productByHandle: ShopifyProduct | null }>({
    query: `
      ${PRODUCT_FRAGMENT}
      query GetProductByHandle($handle: String!) {
        productByHandle(handle: $handle) { ...ProductFields }
      }
    `,
    variables: { handle },
    tags: [`product-${handle}`],
  })
  return body.productByHandle
}

export async function getCollectionByHandle(
  handle: string,
  productsFirst = 12
): Promise<ShopifyCollection | null> {
  const { body } = await shopifyFetch<{ collectionByHandle: ShopifyCollection | null }>({
    query: `
      ${PRODUCT_FRAGMENT}
      query GetCollection($handle: String!, $first: Int!) {
        collectionByHandle(handle: $handle) {
          id handle title description
          image { url altText }
          products(first: $first, sortKey: BEST_SELLING) {
            edges { node { ...ProductFields } }
          }
        }
      }
    `,
    variables: { handle, first: productsFirst },
    tags: [`collection-${handle}`],
  })
  return body.collectionByHandle
}

export async function createCart(): Promise<string> {
  const { body } = await shopifyFetch<{
    cartCreate: { cart: { id: string; checkoutUrl: string } }
  }>({
    query: `
      mutation CreateCart {
        cartCreate {
          cart { id checkoutUrl }
        }
      }
    `,
    cache: 'no-store',
  })
  return body.cartCreate.cart.id
}

export async function addToCart(
  cartId: string,
  lines: { merchandiseId: string; quantity: number }[]
): Promise<void> {
  await shopifyFetch({
    query: `
      mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { id }
          userErrors { field message }
        }
      }
    `,
    variables: { cartId, lines },
    cache: 'no-store',
  })
}
