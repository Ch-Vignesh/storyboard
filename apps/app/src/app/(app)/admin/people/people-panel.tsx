'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from '@/components/link'
import { useState } from 'react'

import {
  CAPABILITY_LABELS,
  GRANTABLE_CAPABILITIES,
  isGrantable,
  type GrantableCapability,
} from '@/lib/authz/admin'
import { ACCOUNT_DELETION_GRACE_DAYS, STANDING_NOTE_MAX_CHARS } from '@/lib/schemas/constants'
import type { AccountStanding } from '@/server/account-standing'
import { useTRPC } from '@/trpc/client'

type Powers = { canDelete: boolean; canManageRoles: boolean }

const ROLE_LABELS = { USER: 'Member', SUB_ADMIN: 'Sub-admin', ADMIN: 'Administrator' } as const

function day(date: Date | null | undefined): string {
  return date
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
}

/**
 * Decision 0043 (phase 14, item 2b.5) — find one account and act on it. Exact
 * username or address, one card, and every button names its consequence. The
 * server refuses what the screen hides (NFR-6).
 */
export function PeoplePanel({ canDelete, canManageRoles }: Powers) {
  const trpc = useTRPC()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const {
    data: account,
    isPending,
    isFetching,
  } = useQuery(
    trpc.admin.findAccount.queryOptions({ query: query ?? '' }, { enabled: query !== null }),
  )

  return (
    <section aria-labelledby="find-heading" className="mt-8">
      <h2
        id="find-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Find an account
      </h2>
      <form
        role="search"
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const next = typed.trim()
          if (next) setQuery(next)
        }}
      >
        <div className="min-w-64 flex-1">
          <Label htmlFor="people-query">Username or email address</Label>
          <Input
            id="people-query"
            className="mt-1"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={!typed.trim() || isFetching}>
          Find the account
        </Button>
      </form>

      {query === null ? null : isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Looking…</p>
      ) : account ? (
        <AccountCard
          key={account.id}
          account={account}
          canDelete={canDelete}
          canManageRoles={canManageRoles}
        />
      ) : (
        <p className="mt-4 text-[14px] text-ink-soft">Nobody has that username or address.</p>
      )}
    </section>
  )
}

function AccountCard({
  account,
  canDelete,
  canManageRoles,
}: { account: AccountStanding } & Powers) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const refresh = async () => {
    await queryClient.invalidateQueries(trpc.admin.findAccount.pathFilter())
    await queryClient.invalidateQueries({ queryKey: trpc.admin.suspended.queryKey() })
  }

  const [open, setOpen] = useState<'suspend' | 'ban' | 'delete' | null>(null)
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState('')
  const done = async () => {
    setOpen(null)
    setNote('')
    setConfirm('')
    await refresh()
  }
  const setStatus = useMutation(trpc.admin.setUserStatus.mutationOptions({ onSuccess: done }))
  const ban = useMutation(trpc.admin.ban.mutationOptions({ onSuccess: done }))
  const unban = useMutation(trpc.admin.unban.mutationOptions({ onSuccess: done }))
  const remove = useMutation(trpc.admin.deleteAccount.mutationOptions({ onSuccess: done }))
  const error = setStatus.error ?? ban.error ?? unban.error ?? remove.error
  const busy = setStatus.isPending || ban.isPending || unban.isPending || remove.isPending

  const name = account.displayName ?? account.username ?? 'An account with no name yet'
  const by = account.suspendedBy
    ? `by ${account.suspendedBy.displayName ?? account.suspendedBy.username ?? 'an administrator'}`
    : 'by ten upheld reports'
  const standing =
    account.status === 'DELETED'
      ? 'Deleted'
      : account.bannedAt
        ? `Banned ${day(account.bannedAt)} ${by}`
        : account.status === 'SUSPENDED'
          ? `Suspended ${day(account.suspendedAt)} ${by}`
          : 'Active'
  const untouchable = account.isYou || account.role === 'ADMIN' || account.status === 'DELETED'
  // What to type to confirm a deletion: the username, or the address of an
  // account that never chose one, as the person's own deletion screen asks.
  const confirmWith = account.username ?? account.email
  const note5 = note.trim() || undefined

  return (
    <article aria-label={account.username ?? name} className="mt-6 border-t border-rule pt-5">
      <h3 className="text-[17px] text-ink">
        {account.username ? (
          <Link href={`/@${account.username}`} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
        {account.username ? <span className="text-ink-faint"> @{account.username}</span> : null}
        {account.isYou ? <span className="text-ink-faint"> · you</span> : null}
      </h3>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
        <Fact term="Standing" detail={standing} />
        <Fact term="Role" detail={ROLE_LABELS[account.role]} />
        <Fact term="Email" detail={account.email} />
        <Fact term="Joined" detail={day(account.createdAt)} />
        <Fact
          term="Last here"
          detail={account.lastSeenAt ? day(account.lastSeenAt) : 'Not since this was counted'}
        />
        <Fact
          term="Reports"
          detail={`${account.reports.upheld} upheld · ${account.reports.open} open`}
        />
        <Fact
          term="Made"
          detail={`${account._count.storyboards} stories · ${account._count.suggestions} suggestions · ${account._count.ideas} ideas`}
        />
        {account.deletionRequestedAt ? (
          <Fact term="Deletion" detail={`Finishes ${day(account.deletionFinishesAt)}`} />
        ) : null}
        {account.grants ? (
          <Fact
            term="Grants"
            detail={
              account.grants.length > 0
                ? account.grants
                    .map((grant) => (isGrantable(grant) ? CAPABILITY_LABELS[grant] : grant))
                    .join(', ')
                : 'None'
            }
          />
        ) : null}
      </dl>
      {account.standingNote ? (
        <p className="mt-3 text-[13.5px] text-ink-soft">Note: {account.standingNote}</p>
      ) : null}

      {untouchable ? (
        account.role === 'ADMIN' && !account.isYou ? (
          <p className="mt-4 text-[13.5px] text-ink-faint">
            The administrator&rsquo;s account cannot be suspended, banned or deleted.
          </p>
        ) : null
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {account.status === 'ACTIVE' ? (
            <Button size="sm" disabled={busy} onClick={() => setOpen('suspend')}>
              Suspend
            </Button>
          ) : null}
          {account.status === 'SUSPENDED' && !account.bannedAt ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => setStatus.mutate({ userId: account.id, status: 'ACTIVE' })}
            >
              Lift the suspension
            </Button>
          ) : null}
          {account.bannedAt ? (
            <Button size="sm" disabled={busy} onClick={() => unban.mutate({ userId: account.id })}>
              Lift the ban
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => setOpen('ban')}>
              Ban
            </Button>
          )}
          {canDelete && !account.deletionRequestedAt ? (
            <Button size="sm" disabled={busy} onClick={() => setOpen('delete')}>
              Delete
            </Button>
          ) : null}
        </div>
      )}

      {open ? (
        <form
          className="mt-4 max-w-measure space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (open === 'suspend') {
              setStatus.mutate({ userId: account.id, status: 'SUSPENDED', note: note5 })
            } else if (open === 'ban') {
              ban.mutate({ userId: account.id, note: note5 })
            } else if (confirm === confirmWith) {
              remove.mutate({ userId: account.id, note: note5, confirm })
            }
          }}
        >
          <div>
            <Label htmlFor="standing-note">Note, for administrators only</Label>
            <Textarea
              id="standing-note"
              className="mt-1"
              rows={3}
              maxLength={STANDING_NOTE_MAX_CHARS}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {open === 'delete' ? (
            <div>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                The account is closed now and erased after {ACCOUNT_DELETION_GRACE_DAYS} days, and
                the address is told. The writing stays, shown as a former member&rsquo;s.
              </p>
              <Label htmlFor="confirm-delete" className="mt-2">
                Type <strong className="font-medium">{confirmWith}</strong> to confirm
              </Label>
              <Input
                id="confirm-delete"
                className="mt-1"
                value={confirm}
                autoComplete="off"
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={busy || (open === 'delete' && confirm !== confirmWith)}
            >
              {open === 'suspend'
                ? 'Suspend this account'
                : open === 'ban'
                  ? 'Ban this account'
                  : 'Delete this account'}
            </Button>
            <button
              type="button"
              className="text-[13px] text-ink-soft underline hover:text-ink"
              onClick={() => setOpen(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}

      {canManageRoles &&
      !account.isYou &&
      account.role !== 'ADMIN' &&
      account.status !== 'DELETED' ? (
        <RoleControls account={account} onChanged={refresh} />
      ) : null}
    </article>
  )
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-faint">{term}</dt>
      <dd className="mt-0.5 text-ink">{detail}</dd>
    </div>
  )
}

/** Decision 0043 (item 2b.3) — the admin alone makes a sub-admin and sets their grants. */
function RoleControls({
  account,
  onChanged,
}: {
  account: AccountStanding
  onChanged: () => Promise<void>
}) {
  const trpc = useTRPC()
  const [grants, setGrants] = useState<GrantableCapability[]>(
    (account.grants ?? []).filter(isGrantable),
  )
  const setRole = useMutation(trpc.admin.setRole.mutationOptions({ onSuccess: onChanged }))
  const saveGrants = useMutation(trpc.admin.setGrants.mutationOptions({ onSuccess: onChanged }))
  const error = setRole.error ?? saveGrants.error

  return (
    <section aria-labelledby="role-heading" className="mt-6 border-t border-rule pt-4">
      <h4
        id="role-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Role
      </h4>
      {account.role === 'USER' ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13.5px] text-ink-soft">
          <span>A member.</span>
          <Button
            size="sm"
            disabled={setRole.isPending}
            onClick={() => setRole.mutate({ userId: account.id, role: 'SUB_ADMIN' })}
          >
            Make a sub-admin
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13.5px] text-ink-soft">
            <span>A sub-admin, with the grants ticked below.</span>
            <Button
              size="sm"
              disabled={setRole.isPending}
              onClick={() => setRole.mutate({ userId: account.id, role: 'USER' })}
            >
              Make a member again
            </Button>
          </div>
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault()
              saveGrants.mutate({ userId: account.id, capabilities: grants })
            }}
          >
            <fieldset>
              <legend className="sr-only">Grants</legend>
              <ul className="grid gap-2 sm:grid-cols-2">
                {GRANTABLE_CAPABILITIES.map((capability) => (
                  <li key={capability}>
                    <label className="flex items-center gap-2 text-[13.5px] text-ink">
                      <input
                        type="checkbox"
                        checked={grants.includes(capability)}
                        onChange={(event) =>
                          setGrants(
                            event.target.checked
                              ? [...grants, capability]
                              : grants.filter((grant) => grant !== capability),
                          )
                        }
                      />
                      {CAPABILITY_LABELS[capability]}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <Button type="submit" size="sm" className="mt-3" disabled={saveGrants.isPending}>
              Save the grants
            </Button>
          </form>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}
    </section>
  )
}
