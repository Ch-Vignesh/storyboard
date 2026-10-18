import type { Metadata } from 'next'

import { safeNext } from '@/lib/safe-next'
import { PINNED_GENRES_MIN } from '@/lib/schemas/constants'
import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { PinGenresForm } from './pin-genres-form'

/**
 * Rendered per request: it reads the session and prefetches through tRPC, both
 * of which need the incoming request. Without this Next tries to prerender it
 * at build time and fails.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Pick your genres' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** FR-1.3 step 4. Pinned genres drive the dashboard's third region and nothing else (FR-11.2). */
export default async function PinGenresPage({ searchParams }: Props) {
  // Item 3.5 — where they were going before all this; the last step lands there.
  const next = safeNext((await searchParams).next)
  prefetch(trpc.user.genres.queryOptions())

  return (
    <HydrateClient>
      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        What do you read and write?
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
        Pick at least {PINNED_GENRES_MIN}. They decide which stuck passages you are shown on your
        dashboard. You can change them whenever you like.
      </p>
      <PinGenresForm next={next} />
    </HydrateClient>
  )
}
