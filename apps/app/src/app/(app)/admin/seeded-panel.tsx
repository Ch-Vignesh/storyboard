'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { useTRPC } from '@/trpc/client'

/**
 * FR-15.5 — the seeded-content manager, and FR-15.4's targets alongside it.
 *
 * The numbers are here because they are the launch risk FR-15.1 names: a
 * visitor who arrives to an empty site bounces permanently, and the only way to
 * know how close the seed is to enough is to be able to see it.
 */
export function SeededPanel() {
  const trpc = useTRPC()
  const { data, isPending } = useQuery(trpc.admin.seeded.queryOptions())

  return (
    <section className="mt-12 border-t border-rule pt-8">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Seeded content
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        Every one of these is labelled <em>example</em> in the interface and owned by a platform
        account (FR-15.3). A seeded storyboard that looks like a real writer&rsquo;s is the one
        unrecoverable launch failure.
      </p>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Counting…</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {Object.entries(data?.progress ?? {}).map(([name, target]) => (
              <div key={name}>
                <dt className="text-[12px] text-ink-faint">{labelFor(name)}</dt>
                <dd className="mt-0.5 text-[16px] text-ink tabular-nums">
                  {target.have}
                  <span className="text-ink-faint"> / {target.want}</span>
                </dd>
              </div>
            ))}
          </dl>

          {(data?.storyboards.length ?? 0) === 0 ? (
            <p className="mt-5 text-[14px] text-ink-soft">
              Nothing seeded yet. FR-15.4 wants 25 storyboards across 6 genres before launch.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-rule border-y border-rule">
              {data?.storyboards.map((storyboard) => (
                <li
                  key={storyboard.id}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <p className="min-w-0 truncate text-[14px]">
                    <Link href={`/s/${storyboard.slug}`} className="text-pencil hover:underline">
                      {storyboard.title}
                    </Link>
                    <span className="text-ink-faint">
                      {' · '}
                      {storyboard.genres.map((entry) => entry.genre.name).join(', ')}
                    </span>
                  </p>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {storyboard.visibility === 'PRIVATE' ? 'private · ' : ''}
                    {storyboard.state.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function labelFor(name: string): string {
  switch (name) {
    case 'storyboards':
      return 'Storyboards'
    case 'genres':
      return 'Genres covered'
    case 'openRequests':
      return 'Open requests'
    case 'answeredRequests':
      return 'Answered'
    default:
      return name
  }
}
