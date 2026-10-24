import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { nameOf } from '@/lib/people'
import { caller } from '@/trpc/server'

import { SettingsForm } from './settings-form'

type Params = { params: Promise<{ slug: string }> }

export const metadata: Metadata = { title: 'Story settings' }

/**
 * Screen 16, storyboard half — FR-2.1, FR-2.6, FR-2.7, FR-14.1, FR-14.5.
 *
 * Phase 14, item 8.10 — the details (title, logline, type, genres, rights
 * note) are every author's to change, as the server always allowed
 * (`storyboard:edit`); who can read it, whether it is finished and deleting
 * it stay the owner's (SRS 3.2), and a co-author is told who changes those.
 * It was the owner's page alone until item 8.10. Anyone else gets the same
 * 404 a stranger would.
 */
export default async function StoryboardSettingsPage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard, permissions } = data

  if (!permissions.canEdit) notFound()

  const impact = permissions.canDelete
    ? await caller.storyboard.deletionImpact({ storyboardId: storyboard.id })
    : { contributors: [] }
  const genres = await caller.user.genres()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Settings</h1>

      <SettingsForm
        storyboardId={storyboard.id}
        slug={slug}
        title={storyboard.title}
        logline={storyboard.logline}
        rightsNote={storyboard.rightsNote}
        type={storyboard.type}
        visibility={storyboard.visibility}
        publicFrom={storyboard.publicFrom}
        finished={storyboard.state === 'FINISHED'}
        finishedAt={storyboard.finishedAt}
        // What a co-author is told about the parts that are not theirs.
        owner={permissions.canSetVisibility ? null : nameOf(storyboard.owner)}
        // An erased contributor has no name to show in the confirmation, so
        // they are not listed — but they are still counted by the credits page.
        contributors={impact.contributors.filter((person) => person !== null)}
        genres={genres}
        genreIds={storyboard.genres.map((genre) => genre.id)}
      />
    </main>
  )
}
