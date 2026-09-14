import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { CopyableCredits } from './copyable-credits'

type Params = { params: Promise<{ username: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Credit lines' }

/**
 * FR-9.6 — a credit line exportable as plain text for a manuscript's front
 * matter: name, role, chapter, date, and the permanent URL.
 *
 * Plain text on a page rather than a file download, because the destination is
 * somebody's front matter and the action is a paste.
 */
export default async function CreditLinesPage({ params }: Params) {
  const { username } = await params

  let data
  try {
    data = await caller.profile.creditLines({ username })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/@${username}`} className="hover:text-ink hover:underline">
          {data.name}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Credit lines
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        For the front matter of a manuscript. Every line carries a permanent address, so the claim
        can be checked by anyone who wants to.
      </p>

      {data.lines.length === 0 ? (
        <p className="mt-8 text-[14px] text-ink-soft">
          Nothing to export yet. Credit lines appear here once a contribution has been accepted.
        </p>
      ) : (
        <CopyableCredits text={data.text} lines={data.lines} />
      )}
    </main>
  )
}
