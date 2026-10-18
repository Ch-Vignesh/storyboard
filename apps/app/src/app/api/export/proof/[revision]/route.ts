import { exportAuthorshipProof } from '@storyboard/export'
import { prisma } from '@storyboard/db'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { env } from '@/env'
import { loadStoryboard } from '@/lib/authz/guard'
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
 * because the facts are secret — a public storyboard's history shows them — but
 * because a document of this kind is issued *to* somebody, and one issued about
 * a stranger on request would be a strange thing for this product to make.
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

  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      authorId: true,
      contentHash: true,
      wordCount: true,
      createdAt: true,
      author: { select: { username: true, displayName: true } },
      section: {
        select: {
          title: true,
          order: true,
          lineageId: true,
          chapter: {
            select: {
              title: true,
              order: true,
              version: {
                select: { storyboard: { select: { id: true, slug: true, title: true } } },
              },
            },
          },
        },
      },
    },
  })

  if (revision?.authorId !== userId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { section } = revision
  const storyboard = section.chapter.version.storyboard

  // And only while they can still read the story. The document carries its
  // current title, chapter and address, so a story that has since gone
  // private, or been deleted, handed those to a former contributor (phase 12
  // audit). The proof is of the words; a story they cannot see is not theirs
  // to describe.
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, deletionRequestedAt: true },
  })
  try {
    await loadStoryboard(prisma, actorFrom(session, account), { id: storyboard.id })
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // The section's history where readers find it now: its lineage's place in
  // the main draft, counted as the reader counts (`server/places.ts`). Built
  // from this row's stored order until the 2026-10-16 spec review, which was
  // wrong for a revision written in an alternate version, or a section moved.
  const place = (await mainDraftPlaces(prisma, storyboard.id, [section.lineageId])).get(
    section.lineageId,
  )
  const url = place
    ? `${env.NEXT_PUBLIC_APP_URL}${place.path}/history`
    : `${env.NEXT_PUBLIC_APP_URL}/s/${storyboard.slug}`

  const file = await exportAuthorshipProof({
    storyboardTitle: storyboard.title,
    author: nameOf(revision.author),
    chapterTitle: place?.chapter ?? section.chapter.title,
    sectionTitle: section.title ?? `Section ${String(section.order + 1)}`,
    wordCount: revision.wordCount,
    contentHash: revision.contentHash,
    writtenAt: revision.createdAt,
    url,
    exportedAt: new Date(),
  })

  log.info({ event: 'export.proof', revisionId, userId }, 'proof of authorship issued')

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'content-type': file.mediaType,
      'content-disposition': `attachment; filename="${file.fileName}"`,
      'content-length': String(file.body.byteLength),
      'cache-control': 'no-store',
    },
  })
}
