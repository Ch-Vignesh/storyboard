import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { AVATAR } from '@/lib/schemas/constants'
import { NotAnImage, shrinkAvatar } from '@/server/avatars'
import { createCallerFactory, createTRPCContext } from '@/server/trpc/init'
import { settingsRouter } from '@/server/trpc/routers/settings'

const log = logger.child({ route: 'avatar' })

/**
 * Phase 14, item 3.13 (D-5) — the upload half of a profile picture.
 *
 * A route rather than a tRPC procedure because the input is a file: up to
 * `AVATAR.maxUploadBytes` of JPEG, PNG or WebP, which through tRPC would be
 * megabytes of base64 inside JSON. The route does the one thing a procedure
 * cannot, reads the bytes, and shrinks them to the icon; the decision and the
 * write belong to `settings.setAvatar`, behind the same gate as every other
 * settings change (NFR-6), which checks the icon again before storing it.
 *
 * Who is asking is checked before anything is decoded: a stranger does not
 * get to make this server resize five-megabyte pictures.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const context = await createTRPCContext({ headers: request.headers })
  if (!context.session?.user) {
    return NextResponse.json({ error: 'Sign in to set a picture.' }, { status: 401 })
  }

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > AVATAR.maxUploadBytes + 16 * 1024) return tooBig()

  const form = await request.formData().catch(() => null)
  const picture = form?.get('picture')
  if (!(picture instanceof File)) {
    return NextResponse.json({ error: 'Choose a picture to upload.' }, { status: 400 })
  }
  if (picture.size > AVATAR.maxUploadBytes) return tooBig()

  let shrunk: Awaited<ReturnType<typeof shrinkAvatar>>
  try {
    shrunk = await shrinkAvatar(Buffer.from(await picture.arrayBuffer()))
  } catch (error) {
    if (error instanceof NotAnImage) {
      return NextResponse.json({ error: error.message }, { status: 415 })
    }
    throw error
  }

  try {
    const { updatedAt } = await createCallerFactory(settingsRouter)(context).setAvatar({
      image: shrunk.bytes.toString('base64'),
    })
    return NextResponse.json({ updatedAt })
  } catch (error) {
    if (error instanceof TRPCError) {
      return NextResponse.json(
        { error: error.message },
        { status: getHTTPStatusCodeFromError(error) },
      )
    }
    log.error({ event: 'avatar.failed', error: String(error) }, 'profile picture upload failed')
    throw error
  }
}

function tooBig(): NextResponse {
  const megabytes = AVATAR.maxUploadBytes / (1024 * 1024)
  return NextResponse.json(
    { error: `That file is too big. Choose a picture under ${String(megabytes)} MB.` },
    { status: 413 },
  )
}
