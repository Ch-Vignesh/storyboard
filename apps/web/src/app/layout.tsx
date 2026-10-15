import type { Metadata } from 'next'

// The typefaces, from this repository rather than fetched from Google on every
// build (see the file). Courier Prime is in it too; nothing here uses it, so
// the browser never downloads it.
import '@storyboard/ui/fonts.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Draftboard',
  description:
    'Post the passage you are stuck on. Other writers propose prose. You accept one, with permanent credit.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
