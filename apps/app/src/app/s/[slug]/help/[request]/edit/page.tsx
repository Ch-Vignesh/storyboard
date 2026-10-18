import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import Link from '@/components/link'
import { REQUEST_STATE_LABELS } from '@/lib/schemas/help'
import { caller } from '@/trpc/server'

import { OpenRequestForm } from '../../new/open-request-form'

type Params = { params: Promise<{ slug: string; request: string }> }

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Change this request' }

/**
 * Phase 14, item 6.1 — the open-request form, filled in, changing a request
 * instead of opening one. For the story's authors while the request is open;
 * anyone else meets the same 404 as the rest of the story's doors.
 */
export default async function EditRequestPage({ params }: Params) {
  const { slug, request: publicId } = await params
  let data
  try {
    data = await caller.request.get({ publicId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { request, permissions } = data
  if (!permissions.canOpenRequest || request.storyboard.slug !== slug) notFound()
  const open = request.state === 'OPEN' || request.state === 'ANSWERED'

  const story = await caller.storyboard.get({ slug })
  const sections = story.chapters.flatMap((chapter) =>
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
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/s/${slug}/help/${publicId}`} className="hover:text-ink hover:underline">
          {request.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        Change this request
      </h1>

      {open ? (
        <>
          <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
            Everything but what it asks for and where. Nobody is told of a change; new word bounds
            apply to what is sent from now on.
          </p>
          <OpenRequestForm
            slug={slug}
            sections={sections}
            edit={{
              requestId: request.id,
              kind: request.kind,
              sectionId: request.section.id,
              initial: {
                title: request.title,
                ask: request.ask,
                preContext: request.preContext ?? '',
                toneNotes: request.toneNotes ?? '',
                characterNotes: request.characterNotes ?? '',
                constraints: request.constraints,
                // Stored as JSON; the schema that wrote it allows only strings.
                readingList: Array.isArray(request.readingList)
                  ? request.readingList.filter(
                      (entry): entry is string => typeof entry === 'string',
                    )
                  : [],
                minWords: request.minWords,
                maxWords: request.maxWords,
              },
            }}
          />
        </>
      ) : (
        <p className="mt-3 max-w-measure text-[14px] leading-relaxed text-ink-soft">
          This request is {REQUEST_STATE_LABELS[request.state]}. Open it again before changing it.
        </p>
      )}
    </main>
  )
}
