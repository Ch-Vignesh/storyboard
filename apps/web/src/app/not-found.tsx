import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Not here — Draftboard',
  robots: { index: false, follow: false },
}

/**
 * Phase 14, item 4.7 — the marketing site's 404. One page lives here, so
 * most wrong addresses are old links or typos; both ways on are the front
 * page and the application's library of public stories.
 */
export default function NotFound() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[70svh] max-w-2xl flex-col justify-center px-6 py-16"
    >
      <p className="text-[11px] tracking-[0.09em] text-ink-faint uppercase">404</p>
      <h1 className="mt-3 font-manuscript text-[30px] leading-tight font-medium text-ink">
        There is no page here
      </h1>
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-soft">
        The address may be old, or mistyped. The front page says what Draftboard is; the library is
        where the public stories are.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
        <Link href="/" className="text-pencil hover:underline">
          Front page
        </Link>
        <a href={`${appUrl}/browse`} className="text-pencil hover:underline">
          Browse stories
        </a>
      </div>
    </main>
  )
}
