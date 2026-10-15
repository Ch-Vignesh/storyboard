import '@storyboard/config/load-env'

import type { NextConfig } from 'next'

// Every link into the application is built from this, at build time. Unset on
// a production build, the page fell back to http://localhost:3200 and shipped
// every visitor's "Create an account" to their own machine; it happened once,
// in phase 8 (phase 12 audit). A production build refuses instead.
if (process.env.VERCEL_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error(
    'NEXT_PUBLIC_APP_URL is not set for this production build, so every link into the ' +
      'application would point at localhost. Set it on the marketing site’s Vercel project.',
  )
}

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
