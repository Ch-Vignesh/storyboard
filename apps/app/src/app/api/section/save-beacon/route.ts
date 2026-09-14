import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { caller } from '@/trpc/server'

/**
 * FR-4.4's "on navigation".
 *
 * Blur covers moving around inside the application, but a closing tab gives no
 * time for a promise to settle — only `navigator.sendBeacon`, which cannot set
 * headers or read a response. This endpoint is the target for that one case.
 *
 * It has no privileges of its own: it calls `section.commitRevision` through
 * the ordinary tRPC caller, so the session cookie, the authorisation check at
 * the data layer and the conflict check all apply exactly as they would to any
 * other save. A stale `baseRevisionId` is refused here too, which is correct —
 * a beacon must not be able to overwrite a co-author.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const payload = body as { sectionId?: unknown; contentJson?: unknown; baseRevisionId?: unknown }
  if (typeof payload.sectionId !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  try {
    await caller.section.commitRevision({
      sectionId: payload.sectionId,
      contentJson: payload.contentJson,
      baseRevisionId: typeof payload.baseRevisionId === 'string' ? payload.baseRevisionId : null,
    })
  } catch (error) {
    // The tab is gone; nobody is waiting for this status. Log it and move on —
    // the three-second draft is the safety net that survives either way.
    logger.warn(
      { event: 'section.commitBeacon.failed', error: String(error) },
      'beacon commit refused',
    )
  }

  return new NextResponse(null, { status: 204 })
}
