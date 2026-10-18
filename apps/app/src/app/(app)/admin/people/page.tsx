import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canAdmin } from '@/lib/authz/admin'
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'

import { currentAdminActor } from '../current-actor'
import { SuspendedPanel } from '../suspended-panel'
import { PeoplePanel } from './people-panel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'People', robots: { index: false, follow: false } }

/**
 * Decision 0043 (phase 14, item 2b.5) — the People screen: find an account,
 * see how it stands, and suspend, ban or delete it. Behind `accounts.suspend`;
 * the delete and the role controls appear only to someone who holds those
 * capabilities, and the server refuses either way (NFR-6).
 */
export default async function PeoplePage() {
  const actor = await currentAdminActor()
  if (!canAdmin(actor, 'accounts.suspend')) notFound()

  return (
    <main id="main" tabIndex={-1}>
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">People</h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Find an account by its exact username or email address. A suspension stops the person
        signing in and writing, and leaves their stories readable; it can be lifted. A ban is a
        suspension that the report review does not lift. Deleting an account closes it now and
        erases it after {ACCOUNT_DELETION_GRACE_DAYS} days, with the writing kept as a former
        member&rsquo;s.
      </p>

      <PeoplePanel
        canDelete={canAdmin(actor, 'accounts.delete')}
        canManageRoles={canAdmin(actor, 'roles.manage')}
      />
      <SuspendedPanel />
    </main>
  )
}
