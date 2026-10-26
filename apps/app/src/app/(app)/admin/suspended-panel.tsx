'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from '@/components/link'

import { REPORTS_TO_SUSPEND } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * FR-13.5 — suspended accounts, and the way back for each.
 *
 * Ten upheld reports suspend an account "pending review", and until the
 * 2026-10-16 spec review there was no review: nothing listed suspended
 * accounts, and the procedure that lifts a suspension had no caller.
 * Lifting one changes nothing else (decision 0018): the reports stay upheld,
 * and the work was never touched.
 */
export function SuspendedPanel() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: suspended, isPending } = useQuery(trpc.admin.suspended.queryOptions())

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.admin.suspended.queryKey() })
    await queryClient.invalidateQueries(trpc.admin.findAccount.pathFilter())
  }
  const lift = useMutation(trpc.admin.setUserStatus.mutationOptions({ onSuccess: refresh }))
  // Decision 0043 (item 2b.5) — a ban is what "Lift the suspension" cannot undo.
  const unban = useMutation(trpc.admin.unban.mutationOptions({ onSuccess: refresh }))
  const error = lift.error ?? unban.error

  return (
    <section className="mt-12 border-t border-rule pt-8">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Suspended accounts
      </h2>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : (suspended?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">Nobody is suspended.</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {suspended?.map((user) => {
            const name = user.displayName ?? user.username ?? 'An account with no name yet'
            const by = user.suspendedBy
              ? `by ${user.suspendedBy.displayName ?? user.suspendedBy.username ?? 'an administrator'}`
              : `by ${String(REPORTS_TO_SUSPEND)} upheld reports`
            return (
              <li key={user.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">
                    {user.username ? (
                      <Link href={`/@${user.username}`} className="hover:underline">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    {user.username ? (
                      <span className="text-ink-faint"> @{user.username}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-faint">
                    {user.bannedAt ? 'Banned' : 'Suspended'}{' '}
                    {user.suspendedAt
                      ? user.suspendedAt.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                        })
                      : ''}{' '}
                    {by} · {user.upheld} upheld {user.upheld === 1 ? 'report' : 'reports'}
                  </p>
                  {user.standingNote ? (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                      Note: {user.standingNote}
                    </p>
                  ) : null}
                </div>
                {user.bannedAt ? (
                  <Button
                    size="sm"
                    disabled={unban.isPending}
                    onClick={() => unban.mutate({ userId: user.id })}
                  >
                    Lift the ban
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={lift.isPending}
                    onClick={() => lift.mutate({ userId: user.id, status: 'ACTIVE' })}
                  >
                    Lift the suspension
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}
    </section>
  )
}
