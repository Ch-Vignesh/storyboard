import { cookies } from 'next/headers'
import Link from '@/components/link'

import { AccountMenu } from '@/components/account-menu'

import { auth } from '@/auth'
import { DeletionBanner } from '@/components/deletion-banner'
import { readTimeZone } from '@/lib/dates'
import { logger } from '@/lib/logger'
import { hasProfile, nameOf } from '@/lib/people'
import { parseReading, READING_COOKIE } from '@/lib/reading'
import { formatInZone, lastWrittenWords } from '@/lib/time-zone'
import { caller, getQueryClient, HydrateClient, trpc } from '@/trpc/server'

import { HiddenStoryBanner } from './hidden-banner'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

import { ReaderShell, type StripPerson } from './reader-shell'

type StoryboardData = inferRouterOutputs<AppRouter>['storyboard']['get']
type Strip = inferRouterOutputs<AppRouter>['credit']['strip']

/**
 * Item 7.3 (FR-9.2) — one person's line in the margin's strip: their latest
 * credit where they have one, how many where they have several, and whether
 * it came with a spin-off (FR-9.5).
 */
function stripLine(entry: Strip['contributors'][number], timeZone: string): string {
  const { latest } = entry
  const date = formatInZone(latest.createdAt, 'dayMonthShort', timeZone)
  const where = latest.place ? `chapter ${String(latest.place.chapterNumber)}` : null
  let line: string
  if (entry.count > 1) line = `${String(entry.count)} contributions, latest ${date}`
  else if (latest.type === 'COAUTHOR') line = `co-author since ${date}`
  else if (latest.type === 'IDEA')
    line = where ? `an idea for ${where}, ${date}` : `an idea, ${date}`
  else line = where ? `${where}, accepted ${date}` : `accepted ${date}`
  return latest.inherited ? `${line} · from the original` : line
}

/**
 * The reader (screen 5), at the story's address or one of the addresses
 * inside it (SRS section 4): a chapter's, which opens on that chapter, and a
 * section's, which also scrolls to that section and marks it. Credit lines
 * print the section's address (FR-9.6), so it has to lead somewhere.
 */
export async function Reader({
  data,
  startAt,
  edition,
}: {
  data: StoryboardData
  startAt?: { chapterId: string; sectionId?: string }
  /** Decision 0044 (item 7b.2) — this is a published edition's page. */
  edition?: { line: string; note: string | null; base: string; current: boolean }
}) {
  // An edition is read as a finished story is (FR-14.1): no margin to fill.
  const finished = data.storyboard.state === 'FINISHED' || Boolean(edition)
  const openingChapterId = startAt?.chapterId ?? data.chapters[0]?.id ?? null
  const queryClient = getQueryClient()

  // Item 7.4 (NFR-1) — the chapter being opened, and the margin's requests,
  // arrive with the page: fetched here with exactly the inputs the shell asks
  // with, and handed over in `HydrateClient`. The server's HTML used to say
  // "Loading…", so first paint waited on two more round trips, and crawlers
  // and link previews got no prose at all. A failure here is left in the
  // cache unhydrated, and the shell asks again and shows its own error.
  const [session, timeZone, cookieStore, strip] = await Promise.all([
    auth(),
    readTimeZone(),
    cookies(),
    // FR-14.1 — a finished story has no margin, so no strip to fill. The
    // strip is a courtesy beside the text: if it fails, the page goes without
    // it rather than failing too, and the failure is logged.
    finished
      ? null
      : caller.credit.strip({ storyboardId: data.storyboard.id }).catch((error: unknown) => {
          logger.error({ event: 'reader.strip_failed', err: error }, 'contributors strip failed')
          return null
        }),
    openingChapterId
      ? queryClient.prefetchQuery(
          trpc.section.listForChapter.queryOptions({ chapterId: openingChapterId }),
        )
      : null,
    finished
      ? null
      : queryClient.prefetchQuery(
          trpc.request.listForStoryboard.queryOptions({ storyboardId: data.storyboard.id }),
        ),
  ])

  const contributors: { total: number; people: StripPerson[] } | null = strip
    ? {
        total: strip.total,
        people: strip.contributors.map((entry, index) => ({
          key: entry.contributor?.id ?? `erased-${String(index)}`,
          person: entry.contributor,
          name: nameOf(entry.contributor),
          href: hasProfile(entry.contributor) ? `/@${entry.contributor.username}` : null,
          line: stripLine(entry, timeZone),
        })),
      }
    : null

  return (
    <HydrateClient>
      <ReaderShell
        // A new shell per chapter address (item 1.14): the chapter being read
        // is the address, and no state from the last one carries over.
        key={startAt?.chapterId ?? 'first'}
        data={data}
        startAt={startAt}
        contributors={contributors}
        reading={parseReading(cookieStore.get(READING_COOKIE)?.value)}
        lastWritten={
          data.storyboard.lastWrittenAt
            ? lastWrittenWords(data.storyboard.lastWrittenAt, timeZone)
            : null
        }
        edition={edition ?? null}
        timeZone={timeZone}
        // Item 7b.2 — the working draft says when there is an edition to read.
        publishedNote={
          !edition && data.latestEdition
            ? {
                text: `Published edition ${String(data.latestEdition.number)}, ${formatInZone(data.latestEdition.publishedAt, 'dayMonth', timeZone)}`,
                href: `/s/${data.storyboard.slug}/published`,
              }
            : null
        }
        // FR-1.2 — a guest reads, and is asked to sign in only to help.
        signedIn={Boolean(session?.user)}
        // Decision 0024 — a pending deletion is said here too (item 1.5); and a
        // story hidden after a report says so to the only people who still open
        // it, its authors and a moderator (item 2.7).
        //
        // The elements made here are keyed: inside `HydrateClient` (item 7.4)
        // they reach the shell as members of a list, and React's development
        // build says so for every page otherwise.
        notice={
          <>
            {session?.user ? <DeletionBanner key="deletion" /> : null}
            {data.storyboard.hiddenAt ? (
              <HiddenStoryBanner key="hidden" reason={data.storyboard.hiddenReason} />
            ) : null}
          </>
        }
        header={
          <Link
            key="home"
            // FR-1.2 (item 4.10) — a guest's way back is Browse; the dashboard needs an account.
            href={session?.user ? '/' : '/browse'}
            className="font-manuscript text-[19px] font-medium tracking-tight text-ink"
          >
            Draftboard
          </Link>
        }
        // Item 4.1 — the account end of the site header, inside the reader's own.
        account={<AccountMenu key="account" session={session} />}
      />
    </HydrateClient>
  )
}
