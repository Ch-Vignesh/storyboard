import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'
import { readTimeZone } from '@/lib/dates'
import { AUDIT_LOG } from '@/lib/schemas/constants'

import { currentAdminActor } from '../current-actor'
import { EventsPanel } from './events-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Events', robots: { index: false, follow: false } }

/**
 * Phase 14, item 10.2 (NFR-7) — the socially significant moments, stored, by
 * story or by person. Behind `events.read` (decision 0043), and a 404 to
 * anyone without it.
 */
export default async function EventsPage() {
  if (!canAdmin(await currentAdminActor(), 'events.read')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Events</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        What was done that matters to someone else: suggestions accepted and passed, earlier
        versions restored, spin-offs, reports, promotions, every decision made in this panel, and
        accounts asked to be deleted, kept or erased. Who did it, to whom, and on which story, never
        anything anybody wrote. Kept for {AUDIT_LOG.retentionDays} days, the newest first.
      </p>
      <EventsPanel timeZone={await readTimeZone()} />
    </main>
  )
}
