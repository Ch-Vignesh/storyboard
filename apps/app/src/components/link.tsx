'use client'

import NextLink, { useLinkStatus } from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

type LinkProps = ComponentProps<typeof NextLink>

/**
 * `next/link`, prefetching on intent rather than on sight. Every link in the
 * application goes through here; a lint rule keeps it that way.
 *
 * Nearly every page in this application is dynamic — it reads the session —
 * and none has a `loading.js`, so Next's default prefetch renders the whole
 * page on the server for every link that scrolls into view. The reader shows
 * an edit and a history link for each section: one view of a twenty-section
 * storyboard asked for over forty server renders at once, each with its own
 * queries, queued behind a ten-connection database pool and waking cold
 * instances (phase 10).
 *
 * So nothing prefetches because it is visible. A pointer resting on a link, a
 * keyboard focus or a touch starts the prefetch instead — still ahead of the
 * click, and only for the one link somebody is reaching for. Pass `prefetch`
 * to opt a link back into Next's own behaviour.
 */
export default function Link({
  href,
  prefetch = false,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...rest
}: LinkProps) {
  const router = useRouter()

  function prefetchOnIntent() {
    // Only our own pages: an absolute URL is somebody else's site.
    if (prefetch === false && typeof href === 'string' && href.startsWith('/')) {
      router.prefetch(href)
    }
  }

  return (
    <NextLink
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event) => {
        prefetchOnIntent()
        onMouseEnter?.(event)
      }}
      onFocus={(event) => {
        prefetchOnIntent()
        onFocus?.(event)
      }}
      onTouchStart={(event) => {
        prefetchOnIntent()
        onTouchStart?.(event)
      }}
      {...rest}
    >
      {rest.children}
      <PendingBar />
    </NextLink>
  )
}

/**
 * Phase 14, item 4.6 — a thin bar across the top of the window while the
 * page this link leads to is on its way. Before it, a click on a cold start
 * looked dead for a second or two. `useLinkStatus` reads the status of the
 * enclosing link, so the bar belongs to the one link that was followed; the
 * pulse is left out for people who asked for less motion, and the bar stays.
 */
function PendingBar() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-pencil motion-safe:animate-pulse"
    />
  )
}
