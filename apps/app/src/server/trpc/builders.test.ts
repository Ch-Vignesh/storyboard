/**
 * What the procedure builders let through, decided by the account's live
 * state rather than by anything in the session token (phase 12 audit).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

type Account = {
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  isAdmin: boolean
  role: 'USER' | 'SUB_ADMIN' | 'ADMIN'
  grants: string[]
  deletionRequestedAt: Date | null
  username: string | null
}

const fine: Account = {
  status: 'ACTIVE',
  isAdmin: false,
  role: 'USER' as const,
  grants: [],
  deletionRequestedAt: null,
  username: 'maya',
}

async function callerAs(account: Account) {
  const {
    accountProcedure,
    activeProcedure,
    adminProcedure,
    createCallerFactory,
    createTRPCRouter,
  } = await import('./init')
  const router = createTRPCRouter({
    write: activeProcedure.mutation(() => 'written'),
    chooseName: accountProcedure.mutation(() => 'chosen'),
    moderate: adminProcedure('reports.decide').mutation(() => 'moderated'),
  })
  return createCallerFactory(router)({
    db: {} as never,
    session: { user: { id: 'u1' }, expires: '' } as never,
    account,
    headers: new Headers(),
  })
}

describe('activeProcedure and accountProcedure', () => {
  it('lets an onboarded account write', async () => {
    expect(await (await callerAs(fine)).write()).toBe('written')
  })

  // Onboarding was enforced only by the proxy, which does not cover `/api/`.
  it('refuses to let an account with no username write, but lets it choose one', async () => {
    const nameless = await callerAs({ ...fine, username: null })
    await expect(nameless.write()).rejects.toThrow(/choose a username/iu)
    expect(await nameless.chooseName()).toBe('chosen')
  })

  it('refuses a suspended account either way', async () => {
    const suspended = await callerAs({ ...fine, status: 'SUSPENDED' })
    await expect(suspended.write()).rejects.toThrow(/suspended/u)
    await expect(suspended.chooseName()).rejects.toThrow(/suspended/u)
  })
})

describe('adminProcedure', () => {
  it('lets an administrator in good standing moderate', async () => {
    expect(
      await (await callerAs({ ...fine, isAdmin: true, role: 'ADMIN' as const })).moderate(),
    ).toBe('moderated')
  })

  // Decision 0043 (item 2b.2): a sub-admin holds the capabilities the admin
  // granted, and nothing else. No grant, no door; a plain user has none.
  it('lets a sub-admin through the door they were granted, and no other', async () => {
    const granted = await callerAs({ ...fine, role: 'SUB_ADMIN', grants: ['reports.decide'] })
    expect(await granted.moderate()).toBe('moderated')
    const other = await callerAs({ ...fine, role: 'SUB_ADMIN', grants: ['flags.toggle'] })
    await expect(other.moderate()).rejects.toThrow(/not found/iu)
    const none = await callerAs({ ...fine, role: 'SUB_ADMIN' })
    await expect(none.moderate()).rejects.toThrow(/not found/iu)
    const user = await callerAs(fine)
    await expect(user.moderate()).rejects.toThrow(/not found/iu)
  })

  // Only `isAdmin` used to be checked, for as long as the session lasted.
  it.each([
    ['suspended', { status: 'SUSPENDED' as const }],
    ['being deleted', { deletionRequestedAt: new Date() }],
    ['erased', { status: 'DELETED' as const }],
  ])('refuses an administrator who is %s', async (_label, change) => {
    const admin = await callerAs({ ...fine, isAdmin: true, role: 'ADMIN' as const, ...change })
    await expect(admin.moderate()).rejects.toThrow(/not found/iu)
  })
})
