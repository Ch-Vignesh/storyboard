import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { VersionsPanel } from './versions-panel'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Versions' }

/** Screen 15 — alternate versions of a storyboard (FR-10.1, FR-10.2). */
export default async function VersionsPage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard } = data

  const { versions, permissions } = await caller.version.list({ storyboardId: storyboard.id })

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Versions</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        A version is a whole draft of {storyboard.title}. Start another when you want to try a
        different chapter without losing the one you have — nothing is overwritten, and you can make
        any of them the main draft later.
      </p>

      <VersionsPanel
        slug={slug}
        storyboardId={storyboard.id}
        initialVersions={versions}
        canEdit={permissions.canCreateVersion}
      />
    </main>
  )
}
