import { prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { logger } from '@/lib/logger'
import { AUTH_LIMITS } from '@/lib/schemas/constants'
import { assembleAccountExport } from '@/server/export/account'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'
import { actorFrom } from '@/server/trpc/init'

const log = logger.child({ route: 'export.account' })

/**
 * Phase 14, item 3.14 — "Download your data": one zip of everything that is
 * yours (`assembleAccountExport`). A route because the answer is a file.
 *
 * Yours and nobody else's: the session decides whose, and a suspended
 * account or one in its deletion grace may still take its own copy — it is
 * the one thing such an account should certainly be able to do. The daily
 * limit is taken after that check, so a refusal costs nothing (decision
 * 0037); each copy reads and renders every story you own.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to download your data.' }, { status: 401 })
  }
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, deletionRequestedAt: true, role: true },
  })
  const actor = account && account.status !== 'DELETED' ? actorFrom(session, account) : null
  if (!actor) {
    return NextResponse.json({ error: 'Sign in to download your data.' }, { status: 401 })
  }

  try {
    await enforce(
      prisma,
      key.dataExport(actor.id),
      { limit: AUTH_LIMITS.dataExportsPerAccountPerDay, windowMs: DAY_MS },
      (retryAt) => `You downloaded your data recently. You can again ${whenToRetry(retryAt)}.`,
    )
  } catch (error) {
    if (error instanceof TRPCError) {
      return NextResponse.json(
        { error: error.message },
        { status: getHTTPStatusCodeFromError(error) },
      )
    }
    throw error
  }

  const { zip, fileName } = await assembleAccountExport(prisma, actor)
  log.info({ event: 'export.account', userId: actor.id, bytes: zip.byteLength }, 'account exported')
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(zip.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
