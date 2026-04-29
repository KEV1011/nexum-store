import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
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
  reactStrictMode: true,
}

export default nextConfig
