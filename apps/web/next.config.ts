import '@storyboard/config/load-env'

import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Same reasoning as the application's, including why `preload` is absent.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ['@storyboard/ui'],
  headers() {
    return Promise.resolve([{ source: '/(.*)', headers: securityHeaders }])
  },
}

export default nextConfig
