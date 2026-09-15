import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { SettingsForm } from './settings-form'

type Params = { params: Promise<{ slug: string }> }

export const metadata: Metadata = { title: 'Storyboard settings' }

/** Screen 16, storyboard half — FR-2.6, FR-2.7, FR-14.5. Owner only. */
export default async function StoryboardSettingsPage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  // Visibility and deletion are owner-only (SRS 3.2); a co-author who reaches
  // this URL gets the same 404 a stranger would.
  if (!data.permissions.canSetVisibility) notFound()

  const impact = await caller.storyboard.deletionImpact({ storyboardId: data.storyboard.id })

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Settings</h1>

      <SettingsForm
        storyboardId={data.storyboard.id}
        title={data.storyboard.title}
        logline={data.storyboard.logline}
        rightsNote={data.storyboard.rightsNote}
        visibility={data.storyboard.visibility}
        publicFrom={data.storyboard.publicFrom}
        // An erased contributor has no name to show in the confirmation, so
        // they are not listed — but they are still counted by the credits page.
        contributors={impact.contributors.filter((person) => person !== null)}
      />
    </main>
  )
}
