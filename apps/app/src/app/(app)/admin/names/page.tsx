import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'

import { currentAdminActor } from '../current-actor'
import { NamesPanel } from './names-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Names', robots: { index: false, follow: false } }

/**
 * Decision 0043 (phase 14, item 2b.6) — usernames banned before anyone takes
 * them. Behind `names.ban`. Names retired with deleted accounts are not here:
 * they are kept as hashes (decision 0042), and nothing lists the erased.
 */
export default async function NamesPage() {
  if (!canAdmin(await currentAdminActor(), 'names.ban')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Names</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        A banned username cannot be chosen; whoever tries is told only that it is taken. A name an
        account already has cannot be banned here: ban the account, from People.
      </p>
      <NamesPanel />
    </main>
  )
}
