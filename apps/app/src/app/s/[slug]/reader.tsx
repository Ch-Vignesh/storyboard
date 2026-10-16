import type { Metadata } from 'next'
import Link from '@/components/link'

import { auth } from '@/auth'
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
      data={data}
      startAt={startAt}
      // FR-1.2 — a guest reads, and is asked to sign in only to help.
      signedIn={Boolean(session?.user)}
      header={
        <Link href="/" className="font-manuscript text-[19px] font-medium tracking-tight text-ink">
          Draftboard
        </Link>
      }
    />
  )
}
