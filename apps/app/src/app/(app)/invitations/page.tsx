import type { Metadata } from 'next'
import Link from '@/components/link'

import { requireSession } from '@/auth/require-session'
import { caller } from '@/trpc/server'

import { InvitationList } from './invitation-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Invitations' }

/** SRS 3.1 — an invitation to co-author is accepted, by the person invited. */
export default async function InvitationsPage() {
  await requireSession()
  const invitations = await caller.coauthor.invitations()

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href="/" className="hover:text-ink hover:underline">
          Your dashboard
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Invitations
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        A co-author writes in the story directly, as its owner does, and is credited as a co-author.
        You can leave a story whenever you like.
      </p>

      <InvitationList invitations={invitations} />
    </main>
  )
}
