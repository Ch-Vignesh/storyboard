import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { OpenRequestForm } from './open-request-form'

type Params = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ section?: string }>
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ask for help' }

/** Screen 7 — the kind picker first, then a form that changes per kind (FR-5.2). */
export default async function NewRequestPage({ params, searchParams }: Params) {
  const { slug } = await params
  const { section: sectionId } = await searchParams

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (!data.permissions.canOpenRequest) notFound()

  const sections = data.chapters.flatMap((chapter) =>
    chapter.sections.map((section) => ({
      id: section.id,
      lineageId: section.lineageId,
      wordCount: section.wordCount,
      label: `${String(chapter.order + 1)}.${String(section.order + 1)} ${
        section.title ?? chapter.title
      }`,
    })),
  )

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Mark a spot you are stuck on
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
        Other writers will see this and can offer help. Be specific about what is wrong — a vague
        ask gets vague answers.
      </p>

      <OpenRequestForm slug={slug} sections={sections} initialSectionId={sectionId} />
    </main>
  )
}
