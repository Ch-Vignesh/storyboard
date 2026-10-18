import { prisma } from '@storyboard/db'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ username: string }> }

/**
 * Phase 14, item 3.13 (D-5) — a person's picture, as bytes.
 *
 * Public, like the profile it belongs to: a picture is shown beside every
 * credit line a stranger can read, so there is nothing to gate (NFR-6 has
 * nothing to say about a file the whole site already shows). What is gated is
 * the account: an erased one has no picture, because the purge deleted the
 * row, and the status check here is the belt to that brace.
 *
 * The URL carries `?v=<updatedAt>` and the answer is cached for a year as
 * immutable: a new picture is a new URL, and the old one can live in caches
 * for as long as they like. `nosniff` so that nothing stored here can ever be
 * read as anything but the image it was checked to be.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { username } = await params
  const avatar = await prisma.userAvatar.findFirst({
    where: { user: { username, status: { not: 'DELETED' } } },
    select: { bytes: true, contentType: true, updatedAt: true },
  })
  if (!avatar) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  return new NextResponse(avatar.bytes, {
    status: 200,
    headers: {
      'Content-Type': avatar.contentType,
      'Content-Length': String(avatar.bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${String(avatar.updatedAt.getTime())}"`,
    },
  })
}
