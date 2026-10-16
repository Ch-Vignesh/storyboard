import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { Reader, readerMetadata } from './reader'

type Params = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ version?: string }>
}

async function load(slug: string, versionId?: string) {
  try {
    return await caller.storyboard.get({ slug, versionId })
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
  return readerMetadata(storyboard)
}

/**
 * The reader (screen 5). Contents rail, manuscript at reading measure.
 *
 * The margin of request cards arrives in phase 2 with requests themselves; the
 * measure, the rail and the leader-rule gutter are laid out now so that adding
 * them is a component, not a rewrite.
 */
export default async function StoryboardPage({ params, searchParams }: Params) {
  const { slug } = await params
  // FR-10.1 — an alternate version is read at the same address, named. An id
  // from another storyboard is a 404: `storyboard.get` checks that it belongs.
  const { version } = (await searchParams) ?? {}
  const data = await load(slug, version)

  return <Reader data={data} />
}
