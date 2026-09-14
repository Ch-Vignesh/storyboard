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
