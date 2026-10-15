import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'

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

export const metadata: Metadata = {
  title: { default: 'Draftboard', template: '%s | Draftboard' },
  description:
    'Post the passage you are stuck on. Other writers propose prose. You accept one, with permanent credit.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {/* SessionProvider so onboarding can refresh the token after steps 3
            and 4 (FR-1.3); server components still read the session directly. */}
        <SessionProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
