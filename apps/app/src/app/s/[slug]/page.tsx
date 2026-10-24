import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { orNotFound, storyMetadata } from '@/lib/metadata'
import { caller } from '@/trpc/server'

import { Reader } from './reader'

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

// Item 9.6 — through the same `storyboard.get`, as the same person, as the page.
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params
  const { version } = (await searchParams) ?? {}
  return orNotFound(storyMetadata(caller, { slug, versionId: version }))
}

/**
 * The reader (screen 5): contents rail, manuscript at reading measure, and
 * the margin of request cards tied to their sections (FR-11.5, `reader.tsx`).
 */
export default async function StoryboardPage({ params, searchParams }: Params) {
  const { slug } = await params
  // FR-10.1 — an alternate version is read at the same address, named. An id
  // from another storyboard is a 404: `storyboard.get` checks that it belongs.
  const { version } = (await searchParams) ?? {}
  const data = await load(slug, version)
  // Decision 0044 (item 7b.2) — an edition has its own address, where it is
  // read as an edition rather than as an alternate draft.
  if (data.version.edition !== null) {
    redirect(`/s/${slug}/published/${String(data.version.edition)}`)
  }

  return <Reader data={data} />
}
