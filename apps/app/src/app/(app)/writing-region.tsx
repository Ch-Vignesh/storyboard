'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'

import { STORY_TYPE_LABELS } from '@/lib/schemas/storyboard'
import { formatInZone, lastWrittenWords } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

/**
 * FR-11.1, region one. Most recently written first, saying when, and which
 * are finished (phase 14, item 7.6).
 */
export function WritingRegion({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const { data: storyboards } = useSuspenseQuery(trpc.storyboard.listMine.queryOptions())

  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Stories you are writing
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
            A story starts with a chapter and an empty section, and you fill it in from there.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary">
              <Link href="/new">Start your first story</Link>
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
                    {storyboard.state === 'FINISHED' ? ' · finished' : ''}
                    {storyboard.lastWrittenAt
                      ? ` · ${lastWrittenWords(storyboard.lastWrittenAt, timeZone)}`
                      : ''}
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

      <RecentlyDeleted timeZone={timeZone} />
    </section>
  )
}

/**
 * FR-2.6 — a deleted story can be brought back for thirty days. Until the
 * 2026-10-16 spec review it vanished from here the moment it was deleted, and
 * nothing anywhere could bring it back. Shown only when there is one.
 */
function RecentlyDeleted({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const deleted = useQuery(trpc.storyboard.listDeleted.queryOptions())
  const restore = useMutation(
    trpc.storyboard.restore.mutationOptions({
      onSuccess: async ({ slug }) => {
        await queryClient.invalidateQueries({ queryKey: trpc.storyboard.listDeleted.queryKey() })
        await queryClient.invalidateQueries({ queryKey: trpc.storyboard.listMine.queryKey() })
        router.push(`/s/${slug}`)
      },
    }),
  )

  if (!deleted.data || deleted.data.length === 0) return null

  return (
    <div className="mt-6">
      <h3 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Deleted, and still yours to bring back
      </h3>
      <ul className="mt-2 divide-y divide-rule border-y border-rule">
        {deleted.data.map((story) => (
          <li key={story.id} className="flex items-baseline justify-between gap-6 py-3">
            <span className="min-w-0">
              <span className="block truncate font-manuscript text-[17px] text-ink-soft">
                {story.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                Removed for good after {formatInZone(story.goneAfter, 'dayMonth', timeZone)}
              </span>
            </span>
            <Button
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ storyboardId: story.id })}
            >
              Bring it back
            </Button>
          </li>
        ))}
      </ul>
      {restore.error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {restore.error.message}
        </p>
      ) : null}
    </div>
  )
}
