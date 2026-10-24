import type { Metadata } from 'next'

// The typefaces, from this repository rather than fetched from Google on every
// build (see the file). Courier Prime is in it too; nothing here uses it, so
// the browser never downloads it.
import '@storyboard/ui/fonts.css'
import './globals.css'

import { SITE } from './site'

/**
 * Phase 14, item 9.6 — a site that exists to be found and shared: its name,
 * what it is, and a preview with the picture in `opengraph-image.tsx`, which
 * Next.js adds to the Open Graph set here. The front page names its own
 * canonical address; nothing here does, or the 404 would inherit it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.name,
  description: SITE.description,
  openGraph: {
    siteName: SITE.name,
    type: 'website',
    locale: 'en_GB',
    title: `${SITE.name}: ${SITE.line}`,
    description: SITE.description,
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
