/**
 * Phase 6's rules, at the layer that decides them.
 *
 * Two things live here that used not to: the quota tiers from decision 0016,
 * and what a suspension does (decision 0018). Both are `lib/authz` questions
 * because both are about what a role may do, and NFR-6 says those are answered
 * once, at the data layer, rather than fifteen times in routers.
 */
import { describe, expect, it } from 'vitest'

import { SUGGESTION_QUOTA } from '@/lib/schemas/constants'

import { can, quotaFor, type Actor, type StoryboardResource } from './index'

const OWNER = 'user_owner'
const COAUTHOR = 'user_coauthor'
const STRANGER = 'user_stranger'

function storyboard(overrides: Partial<StoryboardResource> = {}): StoryboardResource {
  return {
    ownerId: OWNER,
    visibility: 'PUBLIC',
    deletedAt: null,
    coauthorIds: [COAUTHOR],
    ...overrides,
  }
}

describe('the suggestion quota (FR-13.2, decision 0016)', () => {
  it('gives the owner no ceiling on their own storyboard', () => {
    expect(quotaFor({ id: OWNER }, storyboard())).toBe(SUGGESTION_QUOTA.owner)
    expect(Number.isFinite(quotaFor({ id: OWNER }, storyboard()))).toBe(false)
  })

  it('gives a co-author a bigger ceiling, not an exemption', () => {
    const quota = quotaFor({ id: COAUTHOR }, storyboard())
    expect(quota).toBe(SUGGESTION_QUOTA.coauthor)
    // The whole point of OD-6: it is a number, not infinity.
    expect(Number.isFinite(quota)).toBe(true)
    expect(quota).toBeGreaterThan(SUGGESTION_QUOTA.contributor)
  })

  it('gives everyone else three', () => {
    expect(quotaFor({ id: STRANGER }, storyboard())).toBe(SUGGESTION_QUOTA.contributor)
    expect(quotaFor(null, storyboard())).toBe(SUGGESTION_QUOTA.contributor)
  })

  it('is per storyboard: co-authoring one does not raise the ceiling on another', () => {
    const theirs = storyboard()
    const somebodyElses = storyboard({ ownerId: 'someone_else', coauthorIds: [] })

    expect(quotaFor({ id: COAUTHOR }, theirs)).toBe(SUGGESTION_QUOTA.coauthor)
    expect(quotaFor({ id: COAUTHOR }, somebodyElses)).toBe(SUGGESTION_QUOTA.contributor)
  })
})

describe('a suspended account (FR-13.5, decision 0018)', () => {
  const suspended: Actor = { id: STRANGER, status: 'SUSPENDED' }
  const active: Actor = { id: STRANGER, status: 'ACTIVE' }

  it('cannot write anything', () => {
    for (const action of [
      'suggestion:submit',
      'idea:post',
      'storyboard:spinOff',
      'report:create',
    ] as const) {
      expect(can(suspended, action, storyboard()), action).toBe(false)
      expect(can(active, action, storyboard()), action).toBe(true)
    }
  })

  it('cannot write on a storyboard they own either', () => {
    const theirs = storyboard({ ownerId: STRANGER, coauthorIds: [] })
    expect(can(suspended, 'storyboard:edit', theirs)).toBe(false)
    expect(can(suspended, 'storyboard:delete', theirs)).toBe(false)
  })

  it('can still read what anybody can read — the work stays', () => {
    expect(can(suspended, 'storyboard:read', storyboard())).toBe(true)
    const theirs = storyboard({ ownerId: STRANGER, coauthorIds: [] })
    expect(can(suspended, 'storyboard:read', theirs)).toBe(true)
  })

  it('does not make their own private storyboard unreadable to them', () => {
    const theirs = storyboard({ ownerId: STRANGER, visibility: 'PRIVATE', coauthorIds: [] })
    expect(can(suspended, 'storyboard:read', theirs)).toBe(true)
  })

  it('is not the same as deleted, which is inert entirely', () => {
    const deleted: Actor = { id: STRANGER, status: 'DELETED' }
    expect(can(deleted, 'storyboard:read', storyboard())).toBe(false)
    expect(can(deleted, 'suggestion:submit', storyboard())).toBe(false)
  })
})

describe('a private storyboard, to a signed-in stranger (NFR-6)', () => {
  const priv = storyboard({ visibility: 'PRIVATE' })

  it('cannot be read, written to, reported on, or spun off', () => {
    for (const action of [
      'storyboard:read',
      'storyboard:edit',
      'suggestion:submit',
      'idea:post',
      'storyboard:spinOff',
      'report:create',
      'storyboard:export',
    ] as const) {
      expect(can({ id: STRANGER, status: 'ACTIVE' }, action, priv), action).toBe(false)
    }
  })

  it('is readable by its authors, as it always was', () => {
    expect(can({ id: OWNER, status: 'ACTIVE' }, 'storyboard:read', priv)).toBe(true)
    expect(can({ id: COAUTHOR, status: 'ACTIVE' }, 'storyboard:read', priv)).toBe(true)
  })
})
