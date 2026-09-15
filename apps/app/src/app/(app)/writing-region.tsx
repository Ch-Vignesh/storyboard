'use client'

import { Button } from '@storyboard/ui/components/button'
import { useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { STORY_TYPE_LABELS } from '@/lib/schemas/storyboard'
import { useTRPC } from '@/trpc/client'

/** FR-11.1, region one. */
export function WritingRegion() {
  const trpc = useTRPC()
  const { data: storyboards } = useSuspenseQuery(trpc.storyboard.listMine.queryOptions())

  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Storyboards you are writing
        </h2>
        {/* FR-3 — the other way in, for a writer who already has a manuscript. */}
        {storyboards.length > 0 ? (
          <Link href="/import" className="text-[12.5px] text-pencil hover:underline">
            Bring one in from a file
          </Link>
        ) : null}
      </div>

      {storyboards.length === 0 ? (
        // FR-1.5 — never a dead end. The one thing worth doing is offered.
        <div className="mt-4 border border-rule bg-paper-sunk px-6 py-10 text-center">
          <p className="font-manuscript text-[19px] text-ink">Nothing here yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
            A storyboard is one story. It starts with a chapter and an empty section, and you fill
            it in from there.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary">
              <Link href="/new">Start your first storyboard</Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/import">Bring one in from a file</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {storyboards.map((storyboard) => (
            <li key={storyboard.id}>
              <Link
                href={`/s/${storyboard.slug}`}
                className="flex items-baseline justify-between gap-6 py-3.5 hover:bg-paper-sunk"
              >
                <span className="min-w-0">
                  <span className="block truncate font-manuscript text-[19px] text-ink">
                    {storyboard.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {STORY_TYPE_LABELS[storyboard.type]}
                    {storyboard.genres.length > 0
                      ? ` · ${storyboard.genres.map((genre) => genre.name).join(', ')}`
                      : ''}
                    {storyboard.role === 'coauthor' ? ' · co-author' : ''}
                    {storyboard.visibility === 'PRIVATE' ? ' · private' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-ink-faint tabular-nums">
                  {storyboard.wordCount.toLocaleString('en-GB')} words
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
