import { prisma } from '@storyboard/db'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/env'
import { readUnsubscribe, stopEmail } from '@/server/mail/unsubscribe'

export const dynamic = 'force-dynamic'

/**
 * FR-12.1, FR-12.5 (phase 14, item 2.4) — one-click unsubscribe (RFC 8058).
 * A mail client that offers "Unsubscribe" POSTs here with the token from the
 * email's List-Unsubscribe header, and the email is off before the person has
 * opened a page. The token is the whole authority: it names the person and the
 * kinds of email, and it can do nothing but turn them off.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? ''
  const scope = readUnsubscribe(token, env.AUTH_SECRET)
  if (!scope) return new NextResponse('This link is not valid.', { status: 400 })

  await stopEmail(prisma, scope)

  // The page's own button comes back to the page to say so; a mail client
  // wants nothing but a 200.
  const form = await request.formData().catch(() => null)
  if (form?.get('from') === 'page') {
    return NextResponse.redirect(
      new URL(`/unsubscribe?t=${encodeURIComponent(token)}&done=1`, request.url),
      303,
    )
  }
  return new NextResponse('Done. You will not get this email again.', { status: 200 })
}

/**
 * A client that follows the header's address with GET is shown the page,
 * which changes nothing until its button is pressed: link scanners fetch
 * every GET in an email, and a scanner must not be able to turn email off.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(`/unsubscribe${request.nextUrl.search}`, request.url), 303)
}
