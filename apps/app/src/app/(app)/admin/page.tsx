import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'

import { currentAdminActor } from './current-actor'
import { OverviewPanel } from './overview-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Overview', robots: { index: false, follow: false } }

/**
 * FR-15.5, decision 0043 (items 2b.4 and 2b.7) — the panel opens on the
 * numbers. A 404 to anyone without `overview.read`, as every admin screen is
 * to anyone without its capability: that an admin screen exists is not
 * something to confirm to somebody probing for it.
 */
export default async function AdminPage() {
  if (!canAdmin(await currentAdminActor(), 'overview.read')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Overview</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        How the place is doing, in numbers. The screens down the side are the ones you can open.
      </p>
      <OverviewPanel />
    </main>
  )
}
