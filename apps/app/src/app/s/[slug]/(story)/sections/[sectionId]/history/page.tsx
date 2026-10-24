import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import Link from '@/components/link'
import { readTimeZone } from '@/lib/dates'
import { NOT_INDEXED } from '@/lib/metadata'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { HistoryPanel } from '../../../../c/[chapter]/[section]/(tools)/history/history-panel'

type Params = { params: Promise<{ slug: string; sectionId: string }> }

// Item 9.8 — every earlier wording of a passage the reader already shows: not for an index.
export const metadata: Metadata = { title: 'History', robots: NOT_INDEXED }

/**
 * Phase 14, item 5.8 (decision 0008; FR-2.4, FR-8.2) — a section's history
 * by its id rather than its position, so a section that was removed or
 * joined into the one above, and so has no position among the live ones,
 * stays addressable. The same panel and the same permissions as the
 * positional history page; nothing can be restored into a section that is no
 * longer in the story, so the restore buttons stay away.
 */
export default async function SectionHistoryByIdPage({ params }: Params) {
  const { slug, sectionId } = await params
  const [where, history] = await Promise.all([
    caller.section.whereabouts({ sectionId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') return null
      throw error
    }),
    caller.section.history({ sectionId }).catch(() => null),
  ])
  // The address says which story; an id from another story is nobody's business.
  if (!where || !history || where.storyboard.slug !== slug) notFound()

  const timeZone = await readTimeZone()
  const session = await auth()
  const suffix = where.version.isMain ? '' : `?version=${encodeURIComponent(where.version.id)}`
  const name = where.title ?? 'an untitled section'
  const live = !where.removedAt && !where.joinedInto && !where.chapter.removedAt

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}${suffix}`} className="hover:text-ink hover:underline">
          {where.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <span>{where.chapter.title}</span>
      </nav>

      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        History of {name}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        {where.joinedInto
          ? `Joined into ${where.joinedInto.title ?? 'the section above'} on ${formatInZone(where.joinedInto.at, 'dayMonthShort', timeZone)}; its words are there now. Everything it said before is here.`
          : where.removedAt
            ? `Removed on ${formatInZone(where.removedAt, 'dayMonthShort', timeZone)}. Everything it said is here, and it can be brought back from the story's contents for a while.`
            : where.chapter.removedAt
              ? 'Its chapter was removed. Everything it said is here, and it comes back with the chapter.'
              : 'Every version ever saved. Nothing here is ever overwritten or removed.'}
      </p>

      <HistoryPanel
        sectionId={sectionId}
        initial={history}
        canRestore={live && where.canRestore}
        viewerId={session?.user.id ?? null}
        backHref={`/s/${slug}/contents${suffix}`}
        timeZone={timeZone}
      />
    </main>
  )
}
