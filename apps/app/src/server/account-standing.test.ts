import { describe, expect, it } from 'vitest'

import { refuseIfUntouchable, suspendsForReports } from './account-standing'

/** Decision 0043 (phase 14, item 2b.5) — the rules of who may act on whom. */
describe('refuseIfUntouchable', () => {
  const admin = { id: 'admin', role: 'ADMIN' as const }
  const subAdmin = { id: 'sub', role: 'SUB_ADMIN' as const }
  const target = (
    change: Partial<{ id: string; role: 'USER' | 'SUB_ADMIN' | 'ADMIN'; status: string }>,
  ) => ({
    id: 'target',
    role: 'USER' as const,
    status: 'ACTIVE',
    ...change,
  })

  it('lets the admin, and a sub-admin, act on a user', () => {
    expect(() => refuseIfUntouchable(admin, target({}))).not.toThrow()
    expect(() => refuseIfUntouchable(subAdmin, target({}))).not.toThrow()
    expect(() => refuseIfUntouchable(subAdmin, target({ status: 'SUSPENDED' }))).not.toThrow()
  })

  it('refuses your own account', () => {
    expect(() => refuseIfUntouchable(admin, target({ id: 'admin', role: 'ADMIN' }))).toThrow(
      /your own account/u,
    )
    expect(() => refuseIfUntouchable(subAdmin, target({ id: 'sub', role: 'SUB_ADMIN' }))).toThrow(
      /your own account/u,
    )
  })

  it('refuses the administrator, whoever asks', () => {
    expect(() => refuseIfUntouchable(subAdmin, target({ role: 'ADMIN' }))).toThrow(
      /administrator cannot/u,
    )
  })

  it('lets only the admin act on a sub-admin', () => {
    expect(() => refuseIfUntouchable(admin, target({ role: 'SUB_ADMIN' }))).not.toThrow()
    expect(() => refuseIfUntouchable(subAdmin, target({ role: 'SUB_ADMIN' }))).toThrow(
      /Only the administrator/u,
    )
  })

  it('leaves an erased account alone (decision 0024)', () => {
    expect(() => refuseIfUntouchable(admin, target({ status: 'DELETED' }))).toThrow(/deleted/u)
  })
})

/** FR-13.5 — ten upheld reports suspend anyone active, except the administrator. */
describe('suspendsForReports', () => {
  it('suspends an active user, and an active sub-admin', () => {
    expect(suspendsForReports({ status: 'ACTIVE', role: 'USER' })).toBe(true)
    expect(suspendsForReports({ status: 'ACTIVE', role: 'SUB_ADMIN' })).toBe(true)
  })

  it('never suspends the administrator, and nobody who is not active', () => {
    expect(suspendsForReports({ status: 'ACTIVE', role: 'ADMIN' })).toBe(false)
    expect(suspendsForReports({ status: 'SUSPENDED', role: 'USER' })).toBe(false)
    expect(suspendsForReports({ status: 'DELETED', role: 'USER' })).toBe(false)
    expect(suspendsForReports(null)).toBe(false)
  })
})
