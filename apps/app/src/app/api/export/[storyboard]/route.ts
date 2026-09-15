import { EXPORT_FORMATS, exportManuscript, type ExportFormat } from '@storyboard/export'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { prisma } from '@storyboard/db'
import { actorFrom } from '@/server/trpc/init'
import { loadStoryboard } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
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
 */
export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { storyboard: slug } = await params
  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'docx'
  const versionId = url.searchParams.get('version') ?? undefined

  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json({ error: 'That is not a format this can write.' }, { status: 400 })
  }

  const session = await auth()
  const actor = actorFrom(session)

  let storyboardId: string
  try {
    // Throws NOT_FOUND for a storyboard this person may not export — including
    // one they can read. A reader is told the same thing as a stranger.
    ;({ storyboardId } = await loadStoryboard(prisma, actor, { slug }, 'storyboard:export'))
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const manuscript = await assembleManuscript(prisma, storyboardId, versionId)

  if (manuscript.isScreenplay === false && format === 'fountain') {
    return NextResponse.json(
      { error: 'Fountain is for screenplays. Try .docx, .md or .pdf.' },
      { status: 400 },
    )
  }

  const file = await exportManuscript(manuscript, format as ExportFormat)

  log.info(
    { event: 'export.written', storyboardId, format, bytes: file.body.byteLength },
    'manuscript exported',
  )

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'content-type': file.mediaType,
      // The quoted name is what a browser puts in the downloads folder.
      'content-disposition': `attachment; filename="${file.fileName}"`,
      'content-length': String(file.body.byteLength),
      // An export is a snapshot of a manuscript that changes; never cache it.
      'cache-control': 'no-store',
    },
  })
}
