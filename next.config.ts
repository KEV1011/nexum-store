import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Shopify CDN
      {
        protocol: 'https',
        hostname:  '**.myshopify.com',
      },
      {
        protocol: 'https',
        hostname:  'cdn.shopify.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Habilita React strict mode para mejor DX
  reactStrictMode: true,
  // Habilita el compilador de SWC para mayor velocidad de build
  swcMinify: true,
}

export default nextConfig
