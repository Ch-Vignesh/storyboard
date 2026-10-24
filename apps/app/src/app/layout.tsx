import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { cookies } from 'next/headers'

import { TimeZoneCookie } from '@/components/time-zone-cookie'
import { parseReading, READING_COOKIE, readingVariables } from '@/lib/reading'
import { SiteFooter } from '@/components/site-footer'
import { env } from '@/env'
import { SITE } from '@/lib/metadata'
import { TRPCReactProvider } from '@/trpc/client'

// The typefaces, from this repository rather than fetched from Google on every
// build, which failed whenever Google answered in a shape Turbopack could not
// read (phase 12, task 5). See the file for what it is and why.
import '@storyboard/ui/fonts.css'
import './globals.css'

/**
 * The price of a nonce-based Content-Security-Policy (decision 0025).
 *
 * A nonce is minted per request; statically prerendered HTML is written once at
 * build time. The two cannot both be true, and the failure is silent and total:
 * the page still arrives, because the markup is server-rendered, and then every
 * script on it is refused, because `'strict-dynamic'` makes the browser ignore
 * `'self'` and trust only what carries the nonce. Nothing is interactive and
 * nothing in the server log says so.
 *
 * That is exactly what happened when the policy first went in. Five pages were
 * prerendered — sign-up, the rules, the username step and two error pages — and
 * seventeen flows failed, all of them the ones that needed to click something.
 *
 * Declaring it here rather than on those five pages is deliberate. Per-page it
 * would be correct today and wrong the moment somebody adds a sixth, and the
 * symptom of being wrong is a page that looks fine until you touch it.
 *
 * The cost is small and worth naming: this is a per-user, database-backed
 * product where every screen that matters was already rendering per request.
 * What it gives up is static caching of five pages that read nothing.
 */
export const dynamic = 'force-dynamic'

/**
 * Phase 14, item 9.6 — the defaults every page starts from. `metadataBase`
 * makes a canonical address or a preview picture absolute. Open Graph is
 * given no title or description on purpose: Next.js then fills both from the
 * page's own, so a page that names itself names its preview too, and the
 * picture (`opengraph-image.tsx`) stays on every page that does not set its
 * own Open Graph. Pages set a title, a description and robots, never
 * `openGraph`, or the picture would go with it (`lib/metadata.ts`).
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { siteName: SITE.name, type: 'website', locale: 'en_GB' },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // NFR-5 (item 7.5) — the reader's type size and line height, set before
  // anything is drawn, on every page that sets a manuscript.
  const reading = parseReading((await cookies()).get(READING_COOKIE)?.value)

  return (
    <html lang="en" style={readingVariables(reading)}>
      <body>
        {/* NFR-4 (item 4.8) — one skip link, on every page, to the one `main`
            every page has. The header and a contents rail are a lot to tab past. */}
        <a href="#main" className="skip-link">
          Skip to the main content
        </a>
        {/* SessionProvider so onboarding can refresh the token after steps 3
            and 4 (FR-1.3); server components still read the session directly. */}
        <SessionProvider>
          <TRPCReactProvider>
            {children}
            {/* Item 2.6 — on every page but the editor. */}
            <SiteFooter />
          </TRPCReactProvider>
        </SessionProvider>
        {/* Item 1.18 — the browser's time zone, for the server's dates. */}
        <TimeZoneCookie />
      </body>
    </html>
  )
}
