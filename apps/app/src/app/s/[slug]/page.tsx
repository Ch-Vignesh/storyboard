import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import { caller } from '@/trpc/server'

import { ReaderShell } from './reader-shell'

type Params = { params: Promise<{ slug: string }> }

async function load(slug: string) {
  try {
    return await caller.storyboard.get({ slug })
  } catch (error) {
    // A private storyboard is a 404 to anyone who may not read it, at every
    // route including this one (phase 1 exit criterion).
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const { storyboard } = await load(slug)
  return {
    title: storyboard.title,
    description: storyboard.logline ?? undefined,
    // A private storyboard must not be indexed even if a link escapes.
    robots: storyboard.visibility === 'PRIVATE' ? { index: false, follow: false } : undefined,
  }
}

/**
 * The reader (screen 5). Contents rail, manuscript at reading measure.
 *
 * The margin of request cards arrives in phase 2 with requests themselves; the
 * measure, the rail and the leader-rule gutter are laid out now so that adding
 * them is a component, not a rewrite.
 */
export default async function StoryboardPage({ params }: Params) {
  const { slug } = await params
  const data = await load(slug)
  const session = await auth()

  return (
    <ReaderShell
      data={data}
      // FR-1.2 — a guest reads, and is asked to sign in only to help.
      signedIn={Boolean(session?.user)}
      header={
        <Link href="/" className="font-manuscript text-[19px] font-medium tracking-tight text-ink">
          Storyboard
        </Link>
      }
    />
  )
}
