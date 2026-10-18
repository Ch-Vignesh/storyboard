import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { requireSession } from '@/auth/require-session'
import { caller } from '@/trpc/server'

import { CoauthorManager } from './coauthor-manager'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Co-authors' }

/**
 * SRS 3.1, 3.2 — who writes this story. Its authors only: the owner invites
 * and removes, a co-author sees who else writes here and can leave. Anyone
 * else gets the 404 a stranger would.
 */
export default async function CoauthorsPage({ params }: Params) {
  const { slug } = await params
  const session = await requireSession()

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (!data.permissions.canEdit) notFound()

  const list = await caller.coauthor.list({ storyboardId: data.storyboard.id })

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Co-authors</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        A co-author writes in the main draft directly, opens requests and decides on suggestions, as
        the owner does. Only the owner invites, changes who can read it, or deletes it. Up to{' '}
        {list.max} co-authors, invitations included.
      </p>

      <CoauthorManager
        storyboardId={data.storyboard.id}
        slug={slug}
        viewerId={session.user.id}
        canInvite={list.canInvite}
        max={list.max}
        coauthors={list.coauthors}
      />
    </main>
  )
}
