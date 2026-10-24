import { NextResponse } from 'next/server'

import { prisma } from '@storyboard/db'
import { IMPORT_LIMITS, TOO_LARGE } from '@storyboard/import/types'

import { auth } from '@/auth'
import { logger } from '@/lib/logger'
import { putObject, usingObjectStore } from '@/server/storage'

const log = logger.child({ route: 'import/upload' })

/**
 * The upload endpoint used when no object store is configured (FR-3.1).
 *
 * With R2 in place the browser PUTs straight to a presigned URL and this route
 * is never called. Without it — a clone of this repository, a self-hosted
 * deployment — the bytes come here instead. Same contract either way, so the
 * client does not branch.
 *
 * Two things this route must get right, because a presigned URL gets them for
 * free and a hand-written endpoint does not: only a signed-in person may write,
 * and only under their own prefix. A key is a path, and a path from a request
 * body is a directory traversal waiting to happen.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  if (usingObjectStore()) {
    // Not an error worth explaining: it simply is not this deployment's route.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to import a manuscript.' }, { status: 401 })
  }

  const key = new URL(request.url).searchParams.get('key') ?? ''
  // The key was minted by `import.createUpload` for this person. Anything that
  // is not their own prefix is either a mistake or an attempt.
  if (!key.startsWith(`imports/${userId}/`) || key.includes('..')) {
    log.warn({ event: 'import.upload.rejected', userId }, 'upload key did not belong to the caller')
    return NextResponse.json({ error: 'That upload is not yours.' }, { status: 403 })
  }

  // And it has to be a key this application actually issued. Without this, the
  // prefix check alone would let somebody invent keys and write 5 MB at a time
  // for as long as they liked — the daily limit is on `createUpload`, and a
  // presigned URL would have carried that limit with it.
  const job = await prisma.importJob.findFirst({
    where: { userId, fileKey: key, state: 'UPLOADED' },
    select: { id: true },
  })
  if (!job) {
    log.warn({ event: 'import.upload.unknown_key', userId }, 'upload key was never issued')
    return NextResponse.json({ error: 'That upload is not yours.' }, { status: 403 })
  }

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > IMPORT_LIMITS.bytes) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 })
  }

  // The header is a claim, and a chunked upload makes none, so the body is
  // read with a cap rather than whole: reading first and measuring after let
  // an unannounced body fill the server's memory (phase 12 audit).
  const body = await readCapped(request, IMPORT_LIMITS.bytes)
  if (!body) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 })
  }

  await putObject(key, body)
  log.info({ event: 'import.upload', userId, bytes: body.byteLength }, 'manuscript uploaded')

  return NextResponse.json({ ok: true })
}

/** The body, or `null` as soon as it passes `limit` bytes. Never holds more than that. */
async function readCapped(request: Request, limit: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
