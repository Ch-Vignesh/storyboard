'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { nameOf } from '@/lib/people'
import { useTRPC } from '@/trpc/client'

const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const

/**
 * FR-10.4 and FR-10.5 — where this storyboard came from, and where it went.
 *
 * Two facts, both quiet. A spin-off says what it was spun off from and admits
 * it is not tracking it. An original says how many people took it somewhere
 * else. Neither is a badge: the first is a courtesy to the reader who wonders
 * why chapter 12 is missing, the second is the visible half of FR-10.6's
 * promise that an author cannot make a spin-off disappear.
 */
export function LineageBanner({ storyboardId, slug }: { storyboardId: string; slug: string }) {
  const trpc = useTRPC()
  const lineage = useQuery(trpc.spinOff.lineage.queryOptions({ storyboardId }))
  const spinOffs = useQuery(trpc.spinOff.listFor.queryOptions({ storyboardId }))

  const ancestors = lineage.data?.ancestors ?? []
  const origin = ancestors[0]
  const total = spinOffs.data?.total ?? 0

  if (!origin && total === 0) return null

  return (
    <div className="mb-8 max-w-measure space-y-2">
      {origin ? (
        <p className="border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
          Spun off from {/* A private or deleted original keeps its title to itself. */}
          {origin.hidden || !origin.slug ? (
            <span className="italic">{origin.title}</span>
          ) : (
            <>
              <Link href={`/s/${origin.slug}`} className="text-pencil hover:underline">
                {origin.title}
              </Link>{' '}
              by {nameOf(origin.owner)}
            </>
          )}
          {origin.forkedAt ? ` on ${origin.forkedAt.toLocaleDateString('en-GB', DATE)}` : ''}
          {/* FR-10.4 — said only when true, and said plainly when it is. */}
          {origin.continuedSince ? ' — that story has continued since.' : '.'}
          {ancestors.length > 1 || lineage.data?.truncated ? (
            <>
              {' '}
              <Link href={`/s/${slug}/lineage`} className="text-pencil hover:underline">
                See where it came from
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {total > 0 ? (
        <p className="border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
          {total === 1 ? 'One writer has' : `${total} writers have`} taken this story somewhere
          else.{' '}
          <Link href={`/s/${slug}/lineage`} className="text-pencil hover:underline">
            {total === 1 ? 'See it' : 'See them'}
          </Link>
          .
        </p>
      ) : null}
    </div>
  )
}
