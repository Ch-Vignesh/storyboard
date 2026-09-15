import { exportAuthorshipProof } from '@storyboard/export'
import { prisma } from '@storyboard/db'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { env } from '@/env'
import { nameOf } from '@/lib/people'
import { logger } from '@/lib/logger'

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
          chapter: {
            select: {
              title: true,
              order: true,
              version: {
                select: { storyboard: { select: { slug: true, title: true } } },
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

  const file = await exportAuthorshipProof({
    storyboardTitle: storyboard.title,
    author: nameOf(revision.author),
    chapterTitle: section.chapter.title,
    sectionTitle: section.title ?? `Section ${String(section.order + 1)}`,
    wordCount: revision.wordCount,
    contentHash: revision.contentHash,
    writtenAt: revision.createdAt,
    url: `${env.NEXT_PUBLIC_APP_URL}/s/${storyboard.slug}/c/${String(section.chapter.order + 1)}/${String(section.order + 1)}/history`,
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
