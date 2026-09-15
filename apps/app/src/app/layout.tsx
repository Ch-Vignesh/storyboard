import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { Archivo, Courier_Prime, Newsreader } from 'next/font/google'

import { TRPCReactProvider } from '@/trpc/client'

import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500'],
  variable: '--font-newsreader',
  display: 'swap',
})

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier-prime',
  display: 'swap',
})

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
  title: { default: 'Storyboard', template: '%s | Storyboard' },
  description:
    'Post the passage you are stuck on. Other writers propose prose. You accept one, with permanent credit.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${newsreader.variable} ${courierPrime.variable}`}
    >
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
