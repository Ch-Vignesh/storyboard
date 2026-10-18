import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'

import { currentAdminActor } from '../current-actor'
import { SeededPanel } from '../seeded-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Seeds', robots: { index: false, follow: false } }

/** FR-15.4 and FR-15.5 — the seeded-content manager, behind `seeds.manage`. */
export default async function SeedsPage() {
  if (!canAdmin(await currentAdminActor(), 'seeds.manage')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Seeds</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        The stories that are here so a newcomer finds something to help with, and how far they are
        from enough.
      </p>
      <SeededPanel />
    </main>
  )
}
