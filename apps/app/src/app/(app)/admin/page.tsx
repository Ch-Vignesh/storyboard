import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import { prisma } from '@storyboard/db'

import { ReportQueue } from './report-queue'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Moderation', robots: { index: false, follow: false } }

/**
 * FR-13.7 and FR-15.5 — the moderation screen.
 *
 * One screen, because moderation in v1 is the owner's own time and a tool
 * spread across five pages is a tool nobody finishes a queue in. A non-admin
 * gets 404 rather than 403: that an admin screen exists is not something to
 * confirm to somebody probing for it.
 */
export default async function AdminPage() {
  const session = await auth()
  if (!session?.user) notFound()

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })
  if (!account?.isAdmin) notFound()

  return (
    <main id="main" className="mx-auto max-w-4xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Your dashboard
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Moderation</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Reports, in the order they arrived. Upholding one counts towards the ten that suspend an
        account; dismissing one does not count against anybody. Both are reversible.
      </p>

      <ReportQueue />
    </main>
  )
}
