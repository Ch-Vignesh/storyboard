// Order matters: the root .env must be loaded before ./src/env validates it.
import '@storyboard/config/load-env'
import './src/env'

import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  /*
   * Two years, subdomains included, no `preload` (phase 8).
   *
   * The session cookie is already Secure, so this is not what stops it being
   * read — it is what stops the first request of a session going out in the
   * clear at all, which is the one a typed address makes. `preload` is left off
   * deliberately: it is a submission to a list baked into browsers and is
   * effectively irreversible, and this product has not run long enough on this
   * domain to make a promise that shape.
   *
   * Sent on plain HTTP too, where browsers ignore it. Harmless, and it means
   * the header is not conditional on a guess about the environment.
   */
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@storyboard/ui', '@storyboard/db', '@storyboard/compare'],
  // Native and worker-thread modules stay outside the server bundle.
  serverExternalPackages: ['pg', '@node-rs/argon2', 'pino'],
  headers() {
    return Promise.resolve([{ source: '/(.*)', headers: securityHeaders }])
  },
  rewrites() {
    return Promise.resolve([
      // SRS section 4 gives profiles the address /@{username}. A folder whose
      // name starts with an at sign is a parallel route slot in the App Router,
      // so the page lives at /u/{username} and this maps the public URL onto it.
      { source: '/@:username', destination: '/u/:username' },
    ])
  },
}

export default nextConfig
