/**
 * What the procedure builders let through, decided by the account's live
 * state rather than by anything in the session token (phase 12 audit).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

type Account = {
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  isAdmin: boolean
  deletionRequestedAt: Date | null
  username: string | null
}

const fine: Account = {
  status: 'ACTIVE',
  isAdmin: false,
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
    moderate: adminProcedure.mutation(() => 'moderated'),
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
    expect(await (await callerAs({ ...fine, isAdmin: true })).moderate()).toBe('moderated')
  })

  // Only `isAdmin` used to be checked, for as long as the session lasted.
  it.each([
    ['suspended', { status: 'SUSPENDED' as const }],
    ['being deleted', { deletionRequestedAt: new Date() }],
    ['erased', { status: 'DELETED' as const }],
  ])('refuses an administrator who is %s', async (_label, change) => {
    const admin = await callerAs({ ...fine, isAdmin: true, ...change })
    await expect(admin.moderate()).rejects.toThrow(/not found/iu)
  })
})
