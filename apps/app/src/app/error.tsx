'use client'

import { useEffect } from 'react'

/**
 * The error boundary for everything under the root layout.
 *
 * Next.js ships a default, and in production it says "Application error: a
 * server-side exception has occurred" with a digest. That leaks nothing, which
 * is the only good thing about it: it tells somebody whose work may not have
 * saved precisely nothing about whether it did.
 *
 * So this one answers the question the person actually has — is my writing
 * gone — and it can answer honestly, because the editor saves through a
 * separate beacon and a revision is never edited in place (NFR-3). Nothing
 * they had already saved is at risk from a render failing.
 *
 * The digest is shown deliberately. It is the only string that connects what
 * the reader saw to what the server logged, and a bug report that carries it is
 * worth ten that do not.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The browser console, not the application logger: this is a client
    // boundary and `lib/logger` is pino, which does not run here. The server
    // has already logged the cause under the same digest.
    console.error('Storyboard render failed', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70svh] max-w-2xl flex-col justify-center px-6 py-16"
    >
      <p className="text-[11px] tracking-[0.09em] text-ochre uppercase">Something broke</p>
      <h1 className="mt-3 font-manuscript text-[30px] leading-tight font-medium text-ink">
        This screen could not be drawn
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Your writing is safe. Saved work is never edited in place here — every version is written
        once and kept — so nothing you had already saved is affected by this.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="text-pencil-fg min-h-10 rounded-control bg-pencil px-4 text-[14px]"
        >
          Try again
        </button>
        {/*
          A plain anchor, deliberately, and not `next/link`. This is the error
          boundary: whatever failed may be in the router tree above it, and a
          client-side transition would ask the thing that just broke to do the
          navigating. A full page load is the one route out that does not
          depend on the application still working.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="text-[13.5px]">
          Go to your dashboard
        </a>
      </div>

      {error.digest ? (
        <p className="mt-10 text-[12.5px] text-ink-faint">
          If you report this, include{' '}
          <code className="font-mono text-ink-soft">{error.digest}</code> — it is what connects this
          screen to the server log.
        </p>
      ) : null}
    </main>
  )
}
