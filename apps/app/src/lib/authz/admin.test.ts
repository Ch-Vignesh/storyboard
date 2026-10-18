import { describe, expect, it } from 'vitest'

import {
  ADMIN_CAPABILITIES,
  ADMIN_ONLY_CAPABILITIES,
  GRANTABLE_CAPABILITIES,
  canAdmin,
  type AdminActor,
} from './admin'

/** Decision 0043 — one cell per capability and role, as the story matrix has. */
const fine = { status: 'ACTIVE', deletionRequestedAt: null } as const

describe('canAdmin (decision 0043)', () => {
  it('gives the admin every capability', () => {
    for (const capability of ADMIN_CAPABILITIES) {
      expect(canAdmin({ ...fine, role: 'ADMIN' }, capability)).toBe(true)
    }
  })

  it('gives a sub-admin only what was granted', () => {
    const actor: AdminActor = { ...fine, role: 'SUB_ADMIN', grants: ['reports.decide'] }
    for (const capability of ADMIN_CAPABILITIES) {
      expect(canAdmin(actor, capability)).toBe(capability === 'reports.decide')
    }
    expect(canAdmin({ ...fine, role: 'SUB_ADMIN' }, 'reports.decide')).toBe(false)
  })

  it('keeps the admin-only capabilities from a sub-admin, whatever the grants say', () => {
    // A grant row for `roles.manage` cannot be written through `setGrants`;
    // if one were, by hand, it would still open nothing.
    const actor: AdminActor = { ...fine, role: 'SUB_ADMIN', grants: [...ADMIN_CAPABILITIES] }
    for (const capability of ADMIN_ONLY_CAPABILITIES) {
      expect(canAdmin(actor, capability)).toBe(false)
    }
    for (const capability of GRANTABLE_CAPABILITIES) {
      expect(canAdmin(actor, capability)).toBe(true)
    }
  })

  it('lets a greater power carry the lesser: deleting includes suspending', () => {
    const actor: AdminActor = { ...fine, role: 'SUB_ADMIN', grants: ['accounts.delete'] }
    expect(canAdmin(actor, 'accounts.suspend')).toBe(true)
    expect(canAdmin(actor, 'accounts.delete')).toBe(true)
    expect(canAdmin(actor, 'names.ban')).toBe(false)
    // Not the other way round.
    const lesser: AdminActor = { ...fine, role: 'SUB_ADMIN', grants: ['accounts.suspend'] }
    expect(canAdmin(lesser, 'accounts.delete')).toBe(false)
  })

  it('gives a user, and a guest, nothing', () => {
    for (const capability of ADMIN_CAPABILITIES) {
      expect(canAdmin({ ...fine, role: 'USER' }, capability)).toBe(false)
      expect(canAdmin(null, capability)).toBe(false)
    }
  })

  it('takes every power from an admin in bad standing (phase 12 audit)', () => {
    expect(canAdmin({ ...fine, role: 'ADMIN', status: 'SUSPENDED' }, 'overview.read')).toBe(false)
    expect(
      canAdmin({ ...fine, role: 'ADMIN', deletionRequestedAt: new Date() }, 'overview.read'),
    ).toBe(false)
  })
})
