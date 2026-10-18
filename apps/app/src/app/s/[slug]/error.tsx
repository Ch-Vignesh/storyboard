'use client'

import { useParams } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Phase 14, item 4.7 — the boundary for everything under a story: the
 * reader, its sub-pages, the editor. The root boundary's message holds here
 * too (nothing saved is lost, NFR-3); what this one adds is the way back to
 * the story itself, which is where the person was.
 */
export default function StoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { slug } = useParams<{ slug: string }>()

  useEffect(() => {
    console.error('story render failed', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[70svh] max-w-2xl flex-col justify-center px-6 py-16"
    >
      <p className="text-[11px] tracking-[0.09em] text-ochre uppercase">Something broke</p>
      <h1 className="mt-3 font-manuscript text-[30px] leading-tight font-medium text-ink">
        This part of the story could not be drawn
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        That is a fault on our side, not yours. Your writing is safe: saved work is written once and
        kept, so nothing you had already saved is affected by this.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="text-pencil-fg min-h-10 rounded-control bg-pencil px-4 text-[14px]"
        >
          Try again
        </button>
        {/*
          Plain anchors, as in the root boundary: whatever failed may be in the
          router tree, and a full page load is the one way out that does not
          depend on it.
        */}
        <a href={`/s/${slug}`} className="text-[13.5px]">
          Back to the story
        </a>
        <a href="/browse" className="text-[13.5px] text-ink-soft">
          Browse
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
