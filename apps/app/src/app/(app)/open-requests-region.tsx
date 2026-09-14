'use client'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { REQUEST_KINDS } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

/**
 * FR-11.1 region three: open requests in the genres you pinned at onboarding.
 *
 * Pinned genres drive this and nothing else — there is no opaque ranking in v1
 * (FR-11.2). Region two, "requests you have helped with that have news", needs
 * the notification work in phase 3 and is not faked here.
 */
export function OpenRequestsRegion() {
  const trpc = useTRPC()
  const { data: pinned } = useSuspenseQuery(trpc.user.pinnedGenres.queryOptions())
  const genreIds = pinned.map((entry) => entry.genre.id)

  const requests = useQuery(trpc.request.listOpen.queryOptions({ genreIds, take: 8 }))

  return (
    <section className="mt-12">
      <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
        Stuck passages in your genres
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-faint">
        {pinned.length > 0
          ? pinned.map((entry) => entry.genre.name).join(' · ')
          : 'You have not pinned any genres yet.'}
      </p>

      {requests.isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Loading…</p>
      ) : (requests.data ?? []).length === 0 ? (
        <p className="mt-4 border border-rule bg-paper-sunk px-5 py-8 text-center text-[14px] text-ink-soft">
          Nobody in your genres is stuck right now. Try{' '}
          <Link href="/browse" className="text-pencil hover:underline">
            everything that is open
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {(requests.data ?? []).map((request) => {
            const kind = REQUEST_KINDS.find((option) => option.value === request.kind)
            return (
              <li key={request.id}>
                <Link
                  href={`/s/${request.storyboard.slug}/help/${request.publicId}`}
                  className="block h-full border border-rule bg-paper px-4 py-3.5 hover:border-ochre hover:bg-ochre-wash/30"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[11.5px] tracking-wide text-ochre uppercase">
                      {kind?.label}
                    </span>
                    {request.storyboard.isSeed ? (
                      <span className="border border-ochre/40 px-1 text-[10.5px] tracking-wide text-ochre uppercase">
                        example
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block font-manuscript text-[18px] leading-snug text-ink">
                    {request.title}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-ink-soft">
                    {request.storyboard.title} ·{' '}
                    {request.storyboard.owner.displayName ?? request.storyboard.owner.username}
                  </span>
                  <span className="mt-2 block text-[12px] text-ink-faint">
                    {request.kind === 'UNBLOCK'
                      ? `${String(request._count.ideas)} ${request._count.ideas === 1 ? 'idea' : 'ideas'} so far`
                      : `${String(request._count.suggestions)} ${request._count.suggestions === 1 ? 'suggestion' : 'suggestions'} · ${String(request.minWords)}–${String(request.maxWords)} words`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
