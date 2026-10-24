import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'
import { readTimeZone } from '@/lib/dates'

import { currentAdminActor } from '../current-actor'
import { FlagsPanel } from '../flags-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Flags', robots: { index: false, follow: false } }

/** FR-15.5 — feature flags, behind `flags.toggle`. */
export default async function FlagsPage() {
  if (!canAdmin(await currentAdminActor(), 'flags.toggle')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Flags</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Switches that can be thrown without a deploy, for when something has to stop now. Every one
        says what it pauses.
      </p>
      {/* Item 9.4 — who threw a switch, and when, in the admin's own zone (item 1.18). */}
      <FlagsPanel timeZone={await readTimeZone()} />
    </main>
  )
}
