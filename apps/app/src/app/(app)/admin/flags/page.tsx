import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'

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
        Switches that can be thrown without a deploy. Every flag says what it holds back.
      </p>
      <FlagsPanel />
    </main>
  )
}
