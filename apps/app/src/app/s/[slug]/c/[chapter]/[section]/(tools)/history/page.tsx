import type { Metadata } from 'next'
import Link from '@/components/link'

import { auth } from '@/auth'
import { readTimeZone } from '@/lib/dates'
import { NOT_INDEXED } from '@/lib/metadata'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { locate } from '../../locate'
import { HistoryPanel } from './history-panel'

type Params = {
  params: Promise<{ slug: string; chapter: string; section: string }>
  searchParams?: Promise<{ version?: string }>
}

// Item 9.8 — every earlier wording of a passage the reader already shows: not for an index.
export const metadata: Metadata = { title: 'History', robots: NOT_INDEXED }

/**
 * Screen 11 — FR-8.3. Every revision, with who wrote it, when, and where it
 * came from. Restoring one (FR-8.4) appends; it never rewinds.
 */
export default async function SectionHistoryPage({ params, searchParams }: Params) {
  const { slug, chapter: chapterNo, section: sectionNo } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locate(slug, chapterNo, sectionNo, version)

  // Back to the draft this history belongs to, not to the main one.
  const suffix = located.version.isMain ? '' : `?version=${encodeURIComponent(located.version.id)}`
  const [history, where] = await Promise.all([
    caller.section.history({ sectionId: located.section.id }),
    // Item 5.8 — the sections joined into this one keep their own histories.
    caller.section.whereabouts({ sectionId: located.section.id }).catch(() => null),
  ])
  const session = await auth()
  const timeZone = await readTimeZone()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}${suffix}`} className="hover:text-ink hover:underline">
          {located.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <span>
          {located.chapterNumber}. {located.chapter.title}
        </span>
      </nav>

      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        History of {located.section.title ?? `section ${located.sectionNumber}`}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        Every version ever saved. Nothing here is ever overwritten or removed.
      </p>
      {where && where.joinedFrom.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[13.5px] text-ink-soft">
          {where.joinedFrom.map((joined) => (
            <li key={joined.id}>
              Joined from {joined.title ? `“${joined.title}”` : 'an untitled section'} on{' '}
              {formatInZone(joined.at, 'dayMonthShort', timeZone)} —{' '}
              <Link
                href={`/s/${slug}/sections/${joined.id}/history`}
                className="text-pencil hover:underline"
              >
                its earlier versions
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <HistoryPanel
        sectionId={located.section.id}
        initial={history}
        canRestore={located.permissions.canRestore}
        viewerId={session?.user.id ?? null}
        // Item 8.1 — back to this section, not to chapter one.
        backHref={`/s/${slug}/c/${chapterNo}/${sectionNo}${suffix}`}
        // Item 1.18 — the same zone on the server and in the browser, so the
        // hours do not change on load.
        timeZone={timeZone}
      />
    </main>
  )
}
