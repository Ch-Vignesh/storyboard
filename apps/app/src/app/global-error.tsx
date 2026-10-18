'use client'

import { useEffect } from 'react'

/**
 * Phase 14, item 4.7 — the boundary above the root layout. When the root
 * layout itself cannot render, nothing of ours is on the page, so this
 * brings its own `<html>` and `<body>` and uses no component, no font and no
 * token class that the broken layout would have provided. Plain, and honest:
 * the fault is ours, the person's writing is safe (NFR-3: a saved revision is
 * never edited in place), and Try again is the way out.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('root render failed', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: '64px 24px',
          background: '#fbfbf9',
          color: '#11202b',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.5,
        }}
      >
        <main id="main" tabIndex={-1} style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Something broke
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: '12px 0 0', lineHeight: 1.2 }}>
            Something went wrong on our side, not yours
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, color: '#55636d' }}>
            Your writing is safe: saved work is written once and kept, so nothing you had already
            saved is touched by this. Try again; if it keeps happening, write to us from the contact
            page.
          </p>
          <div style={{ marginTop: 28, display: 'flex', gap: 16, alignItems: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 40,
                padding: '0 16px',
                border: 0,
                borderRadius: 6,
                background: '#2b5ca8',
                color: '#ffffff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a href="/browse" style={{ fontSize: 13.5, color: '#2b5ca8' }}>
              Go to Browse
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: 40, fontSize: 12.5, color: '#8a949c' }}>
              If you report this, include <code>{error.digest}</code> — it is what connects this
              screen to the server log.
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
