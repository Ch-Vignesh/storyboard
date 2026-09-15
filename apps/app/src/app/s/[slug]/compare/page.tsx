import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { ComparePanel } from './compare-panel'

type Params = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ a?: string; b?: string }>
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Compare versions' }

/** FR-7.5 — two versions of a storyboard, side by side. */
export default async function ComparePage({ params, searchParams }: Params) {
  const { slug } = await params
  const { a, b } = await searchParams

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard } = data

  const { versions } = await caller.version.list({ storyboardId: storyboard.id })

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.title}
        </Link>
        <span className="mx-1.5">·</span>
        <Link href={`/s/${slug}/versions`} className="hover:text-ink hover:underline">
          Versions
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Compare versions
      </h1>

      {versions.length < 2 ? (
        <p className="mt-6 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          {storyboard.title} has one version. Start another from the{' '}
          <Link href={`/s/${slug}/versions`} className="text-pencil hover:underline">
            versions page
          </Link>{' '}
          and you can compare them here.
        </p>
      ) : (
        <ComparePanel
          slug={slug}
          versions={versions.map((version) => ({
            id: version.id,
            name: version.name,
            isMain: version.isMain,
          }))}
          initialBase={a ?? versions.find((version) => version.isMain)?.id ?? versions[0]!.id}
          initialTarget={b ?? versions.find((version) => !version.isMain)?.id ?? versions[1]!.id}
        />
      )}
    </main>
  )
}
