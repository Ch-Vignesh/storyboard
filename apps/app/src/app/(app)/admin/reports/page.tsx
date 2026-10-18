import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'

import { currentAdminActor } from '../current-actor'
import { ReportQueue } from '../report-queue'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } }

/**
 * FR-13.7 and FR-15.5 — the report queue, behind `reports.decide`. One
 * screen, because moderation in v1 is the owner's own time, and a tool spread
 * across five pages is a tool nobody finishes a queue in.
 */
export default async function ReportsPage() {
  if (!canAdmin(await currentAdminActor(), 'reports.decide')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Reports</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        In the order they arrived. Upholding one counts towards the ten that suspend an account;
        dismissing one does not count against anybody. Both are reversible.
      </p>
      <ReportQueue />
    </main>
  )
}
