// Order matters: the root .env must be loaded before ./src/env validates it.
import '@storyboard/config/load-env'
import './src/env'

import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@storyboard/ui', '@storyboard/db'],
  // Native and worker-thread modules stay outside the server bundle.
  serverExternalPackages: ['pg', '@node-rs/argon2', 'pino'],
  headers() {
    return Promise.resolve([{ source: '/(.*)', headers: securityHeaders }])
  },
}

export default nextConfig
