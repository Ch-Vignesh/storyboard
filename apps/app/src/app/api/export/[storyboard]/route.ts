import {
  contentDisposition,
  EXPORT_FORMATS,
  exportManuscript,
  type ExportFormat,
} from '@storyboard/export'
import { TRPCError } from '@trpc/server'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { prisma } from '@storyboard/db'
import { actorFrom } from '@/server/trpc/init'
import { loadStoryboard } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { timeZoneFromCookieHeader } from '@/lib/time-zone'
import { assembleManuscript } from '@/server/export/manuscript'

const log = logger.child({ route: 'export' })

type Params = { params: Promise<{ storyboard: string }> }

/**
 * FR-14.2 — the manuscript, as a file.
 *
 * A route rather than a tRPC procedure because the answer is bytes with a
 * filename, and tRPC would mean base64 through JSON and a second hop to turn it
 * back into a download. The permission check is the same one the API uses
 * (NFR-6): `loadStoryboard` with `storyboard:export`, at the data layer.
 *
 * What to take is said in named query parameters (item 8.8): `format`,
 * `version` for an alternate version, and `chapter` for one chapter by the
 * number the reader gives it. Anything later adds a name of its own.
 */
export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { storyboard: slug } = await params
  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'docx'
  const versionId = url.searchParams.get('version') ?? undefined
  const chapterParam = url.searchParams.get('chapter')
  const chapter = chapterParam === null ? undefined : Number(chapterParam)

  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json({ error: 'That is not a format this can write.' }, { status: 400 })
  }
  if (chapter !== undefined && !(Number.isSafeInteger(chapter) && chapter >= 1)) {
    return NextResponse.json({ error: 'Chapters are numbered from 1.' }, { status: 400 })
  }

  const session = await auth()
  // FR-13.5 — a route handler has no tRPC context, so it reads the account's
  // live status the same way the context does. Exporting is a write action in
  // every sense that matters: it takes the manuscript out.
  const account = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        // `deletionRequestedAt` too: without it `can()` took an account in its
        // deletion grace (decision 0024) for an active one, and let it export
        // (phase 12 audit).
        select: { status: true, deletionRequestedAt: true },
      })
    : null
  const actor = actorFrom(session, account)

  let storyboardId: string
  try {
    // Throws NOT_FOUND for a storyboard this person may not export — including
    // one they can read. A reader is told the same thing as a stranger.
    ;({ storyboardId } = await loadStoryboard(prisma, actor, { slug }, 'storyboard:export'))
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  let manuscript
  try {
    manuscript = await assembleManuscript(prisma, storyboardId, { versionId, chapter })
  } catch (error) {
    // A `?version=` that is not one of this story's, or a `?chapter=` past
    // its last: the same answer as a story that is not there. It was a 500
    // until the 2026-10-16 spec review.
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }
    throw error
  }

  if (manuscript.isScreenplay === false && format === 'fountain') {
    return NextResponse.json(
      { error: 'Fountain is for screenplays. Try .docx, .md or .pdf.' },
      { status: 400 },
    )
  }

  // Item 7b.3 (decision 0044) — a published edition is named as one.
  const edition = versionId
    ? await prisma.publication.findUnique({ where: { versionId }, select: { number: true } })
    : null

  // Item 8.8 — named for the day where the writer is (item 1.18), and for
  // what it holds when that is not the whole main draft.
  const file = await exportManuscript(manuscript, format as ExportFormat, {
    timeZone: timeZoneFromCookieHeader(request.headers.get('cookie')),
    chapter,
    version: manuscript.version.isMain || edition ? null : manuscript.version.name,
    extra: edition ? `edition ${String(edition.number)}` : null,
  })

  log.info(
    {
      event: 'export.written',
      storyboardId,
      format,
      chapter: chapter ?? null,
      alternate: !manuscript.version.isMain,
      bytes: file.body.byteLength,
    },
    'manuscript exported',
  )

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'content-type': file.mediaType,
      // What a browser puts in the downloads folder: `filename*`, the title
      // as written, where it can; the quoted ASCII name where it cannot.
      'content-disposition': contentDisposition(file),
      'content-length': String(file.body.byteLength),
      // An export is a snapshot of a manuscript that changes; never cache it.
      'cache-control': 'no-store',
    },
  })
}
