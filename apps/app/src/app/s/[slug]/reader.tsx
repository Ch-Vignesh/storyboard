import type { Metadata } from 'next'
import Link from '@/components/link'

import { AccountMenu } from '@/components/account-menu'

import { auth } from '@/auth'
import { DeletionBanner } from '@/components/deletion-banner'

import { HiddenStoryBanner } from './hidden-banner'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

import { ReaderShell } from './reader-shell'

type StoryboardData = inferRouterOutputs<AppRouter>['storyboard']['get']

export function readerMetadata(storyboard: StoryboardData['storyboard']): Metadata {
  return {
    title: storyboard.title,
    description: storyboard.logline ?? undefined,
    // A private storyboard must not be indexed even if a link escapes.
    robots: storyboard.visibility === 'PRIVATE' ? { index: false, follow: false } : undefined,
  }
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
}: {
  data: StoryboardData
  startAt?: { chapterId: string; sectionId?: string }
}) {
  const session = await auth()

  return (
    <ReaderShell
      // A new shell per chapter address (item 1.14): the chapter being read
      // is the address, and no state from the last one carries over.
      key={startAt?.chapterId ?? 'first'}
      data={data}
      startAt={startAt}
      // FR-1.2 — a guest reads, and is asked to sign in only to help.
      signedIn={Boolean(session?.user)}
      // Decision 0024 — a pending deletion is said here too (item 1.5); and a
      // story hidden after a report says so to the only people who still open
      // it, its authors and a moderator (item 2.7).
      notice={
        <>
          {session?.user ? <DeletionBanner /> : null}
          {data.storyboard.hiddenAt ? (
            <HiddenStoryBanner reason={data.storyboard.hiddenReason} />
          ) : null}
        </>
      }
      header={
        <Link
          // FR-1.2 (item 4.10) — a guest's way back is Browse; the dashboard needs an account.
          href={session?.user ? '/' : '/browse'}
          className="font-manuscript text-[19px] font-medium tracking-tight text-ink"
        >
          Draftboard
        </Link>
      }
      // Item 4.1 — the account end of the site header, inside the reader's own.
      account={<AccountMenu session={session} />}
    />
  )
}
