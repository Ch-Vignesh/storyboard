import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'
import { readTimeZone } from '@/lib/dates'
import { SERVER_ERRORS } from '@/lib/schemas/constants'

import { currentAdminActor } from '../current-actor'
import { ErrorsPanel } from './errors-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Errors', robots: { index: false, follow: false } }

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — the server's own faults, a line per
 * kind. Behind `errors.read` (decision 0043), and a 404 to anyone without it.
 */
export default async function ErrorsPage() {
  if (!canAdmin(await currentAdminActor(), 'errors.read')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Errors</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Faults of the server&rsquo;s own that no code handled, one line for each kind, the most
        recent first, kept for {SERVER_ERRORS.retentionDays} days. Each keeps where it happened, the
        error and the top of its stack, never what anybody sent or wrote. A kind nobody has been
        told about is emailed to everyone who can open this screen.
      </p>
      <ErrorsPanel timeZone={await readTimeZone()} />
    </main>
  )
}
