import { contentDisposition, exportAuthorshipProof } from '@storyboard/export'
import { prisma } from '@storyboard/db'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { env } from '@/env'
import { loadRevisionRecord } from '@/lib/authz/guard'
import { actorFrom } from '@/server/trpc/init'
import { nameOf } from '@/lib/people'
import { logger } from '@/lib/logger'
import { mainDraftPlaces } from '@/server/places'

const log = logger.child({ route: 'export/proof' })

type Params = { params: Promise<{ revision: string }> }

/**
 * FR-13.6 — proof that you wrote this, when you say you did.
 *
 * Offered to the person the revision is attributed to and to nobody else. Not
 * because the facts are secret — since item 8.12 they are on a public record
 * page — but because a document of this kind is issued *to* somebody, and one
 * issued about a stranger on request would be a strange thing for this
 * product to make.
 *
 * A contributor who has erased their record (decision 0013) no longer has a
 * revision attributed to them, and so can no longer draw a proof from it. That
 * is the trade the erasure screen names: the name goes from everywhere.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { revision: revisionId } = await params

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  // Item 8.12 — the record page's rule decides who takes it away: the writer
  // the record names, and only while they can still read that version. The
  // document carries the story's current title, chapter and address, so a
  // story that has since gone private, or been deleted, handed those to a
  // former contributor until the phase 12 audit. Never for a restore either:
  // its words were written by whoever wrote the version it copied, and the
  // restorer was offered a proof of them until item 8.12.
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, deletionRequestedAt: true },
  })
  const record = await loadRevisionRecord(prisma, actorFrom(session, account), revisionId)
  if (!record?.mayTakePdf || !record.story) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const revision = await prisma.revision.findUniqueOrThrow({
    where: { id: revisionId },
    select: {
      section: {
        select: {
          title: true,
          order: true,
          lineageId: true,
          chapter: {
            select: { title: true, version: { select: { storyboardId: true } } },
          },
        },
      },
    },
  })
  const { section } = revision

  // The chapter as readers find it now: its lineage's place in the main
  // draft, counted as the reader counts (`server/places.ts`).
  const place = (
    await mainDraftPlaces(prisma, section.chapter.version.storyboardId, [section.lineageId])
  ).get(section.lineageId)

  const file = await exportAuthorshipProof({
    storyboardTitle: record.story.title,
    author: nameOf(record.revision.author),
    chapterTitle: place?.chapter ?? section.chapter.title,
    sectionTitle: section.title ?? `Section ${String(section.order + 1)}`,
    wordCount: record.revision.wordCount,
    contentHash: record.revision.contentHash,
    writtenAt: record.revision.createdAt,
    // Item 8.12 — the public record, which anyone can open, rather than the
    // section's history, which is a 404 to a stranger on a private story.
    url: `${env.NEXT_PUBLIC_APP_URL}/proof/${revisionId}`,
    exportedAt: new Date(),
  })

  log.info({ event: 'export.proof', revisionId, userId }, 'proof of authorship issued')

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'content-type': file.mediaType,
      // Item 8.8 — the story's title as written, where the browser takes it.
      'content-disposition': contentDisposition(file),
      'content-length': String(file.body.byteLength),
      'cache-control': 'no-store',
    },
  })
}
