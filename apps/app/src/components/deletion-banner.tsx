import { formatDate } from '@/lib/dates'
import { contactAddress } from '@/lib/site'
import { caller } from '@/trpc/server'

import { KeepAccountButton } from './keep-account-button'

/**
 * Decision 0024 (phase 14, item 1.5) — while an account is scheduled for
 * deletion, every signed-in page says so and offers the way back; nothing
 * promised this banner until now. Nothing is shown when no deletion is
 * pending, and a refused lookup (a session that has ended) shows nothing
 * rather than failing the page.
 */
export async function DeletionBanner() {
  const status = await caller.settings.deletionStatus().catch(() => null)
  if (!status) return null

  const finishesOn = await formatDate(status.finishesAt, 'long')

  return (
    <section aria-label="Account deletion" className="border-b border-ochre/40 bg-ochre-wash">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-2.5 text-[13.5px] leading-relaxed text-ink">
        {status.byAdmin ? (
          // Decision 0043 (item 2b.5) — closed by an administrator: the way
          // back is the support address, not a button.
          <p>
            Draftboard has closed this account. It is being deleted on{' '}
            <strong className="font-medium">{finishesOn}</strong>. If you think this is a mistake,
            write to{' '}
            <a href={`mailto:${contactAddress()}`} className="underline">
              {contactAddress()}
            </a>
            .
          </p>
        ) : (
          <>
            <p>
              This account is being deleted on <strong className="font-medium">{finishesOn}</strong>
              . Until then you can read, and nothing you write is kept. If you did not ask for this,
              keep the account and change your password.
            </p>
            <KeepAccountButton />
          </>
        )}
      </div>
    </section>
  )
}
