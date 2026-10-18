'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'

import { formatInZone } from '@/lib/time-zone'
import { SOFT_DELETE_GRACE_DAYS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * Phase 14, item 5.7 (decision 0008) — what was removed from this version in
 * the last `SOFT_DELETE_GRACE_DAYS`, with the way back. A chapter comes back
 * with its sections, at the end; a section at the end of its chapter.
 * Requests closed by the removal stay closed, and the row says so. A removed
 * section's earlier versions stay readable (item 5.8).
 */
export function RemovedList({
  slug,
  versionId,
  timeZone,
}: {
  slug: string
  versionId: string
  timeZone: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const removed = useQuery(trpc.chapter.removed.queryOptions({ versionId }))
  const refresh = async () => {
    await removed.refetch()
    router.refresh()
  }
  const restoreChapter = useMutation(trpc.chapter.restore.mutationOptions({ onSuccess: refresh }))
  const restoreSection = useMutation(trpc.section.restore.mutationOptions({ onSuccess: refresh }))

  const data = removed.data
  if (!data || (data.chapters.length === 0 && data.sections.length === 0)) return null
  const when = (date: Date | null) =>
    date ? formatInZone(date, 'dayMonthShort', timeZone) : 'lately'
  const error = restoreChapter.error ?? restoreSection.error

  return (
    <section className="mt-12">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Removed in the last {SOFT_DELETE_GRACE_DAYS} days
      </h2>
      <p className="mt-2 max-w-measure text-[13px] leading-relaxed text-ink-soft">
        Brought back, a chapter returns with its sections at the end of the story, and a section at
        the end of its chapter. Requests that closed when they were removed stay closed.
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {data.chapters.map((chapter) => (
          <li key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">{chapter.title}</p>
              <p className="text-[12.5px] text-ink-faint">
                Chapter · {chapter.sections} {chapter.sections === 1 ? 'section' : 'sections'} ·{' '}
                {chapter.words.toLocaleString('en-GB')} words · removed {when(chapter.removedAt)}
              </p>
            </div>
            <Button
              size="sm"
              disabled={restoreChapter.isPending}
              onClick={() => restoreChapter.mutate({ chapterId: chapter.id })}
            >
              Bring it back
            </Button>
          </li>
        ))}
        {data.sections.map((section) => (
          <li key={section.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">{section.title ?? 'Untitled section'}</p>
              <p className="text-[12.5px] text-ink-faint">
                Section of {section.chapterTitle} · {section.words.toLocaleString('en-GB')} words ·
                removed {when(section.removedAt)} ·{' '}
                <Link
                  href={`/s/${slug}/sections/${section.id}/history`}
                  className="text-pencil hover:underline"
                >
                  its earlier versions
                </Link>
              </p>
            </div>
            <Button
              size="sm"
              disabled={restoreSection.isPending}
              onClick={() => restoreSection.mutate({ sectionId: section.id })}
            >
              Bring it back
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}
    </section>
  )
}
