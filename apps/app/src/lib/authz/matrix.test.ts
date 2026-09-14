/**
 * One test per cell of the permission matrix (SRS section 3.2), plus the
 * resource rules that sit on top of it. The phase 1 exit criterion is that
 * every cell has a passing test and that a signed-in stranger gets 404 — not
 * 403 — on a private storyboard.
 */

import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'

import {
  ACTION_LABELS,
  MATRIX,
  MATRIX_ACTIONS,
  ROLES,
  assertCan,
  can,
  canReadRevisionAt,
  isAuthor,
  permissionsFor,
  revisionVisibilityWhere,
  roleOn,
  type Actor,
  type MatrixAction,
  type Role,
  type StoryboardResource,
} from './index'

const OWNER = 'user_owner'
const COAUTHOR = 'user_coauthor'
const STRANGER = 'user_stranger'

/** An actor sitting on the given row of the matrix. */
function actorFor(role: Role): Actor {
  switch (role) {
    case 'owner':
      return { id: OWNER, status: 'ACTIVE' }
    case 'coauthor':
      return { id: COAUTHOR, status: 'ACTIVE' }
    case 'reader':
      return { id: STRANGER, status: 'ACTIVE' }
    case 'guest':
      return null
  }
}

function storyboard(overrides: Partial<StoryboardResource> = {}): StoryboardResource {
  return {
    ownerId: OWNER,
    visibility: 'PUBLIC',
    deletedAt: null,
    coauthorIds: [COAUTHOR],
    ...overrides,
  }
}

/**
 * The matrix splits reading by visibility, so each cell has to be exercised
 * against the storyboard that row is about. Everything else is tested on a
 * public storyboard, where the "you cannot act on what you cannot see" rule is
 * out of the way and the table itself is what decides.
 */
function resourceForCell(action: MatrixAction): StoryboardResource {
  return action === 'storyboard:readPrivate' ? storyboard({ visibility: 'PRIVATE' }) : storyboard()
}

describe('permission matrix (SRS 3.2)', () => {
  it('covers every capability in the SRS table', () => {
    expect(MATRIX_ACTIONS).toHaveLength(15)
    for (const action of MATRIX_ACTIONS) {
      expect(Object.keys(MATRIX[action]).sort()).toEqual([...ROLES].sort())
    }
  })

  // 15 capabilities x 4 roles = 60 cells, one test each.
  for (const action of MATRIX_ACTIONS) {
    describe(ACTION_LABELS[action], () => {
      for (const role of ROLES) {
        const expected = MATRIX[action][role]
        it(`${role} ${expected ? 'can' : 'cannot'}`, () => {
          expect(can(actorFor(role), action, resourceForCell(action))).toBe(expected)
        })
      }
    })
  }
})

describe('roleOn', () => {
  it('reads the owner from ownerId', () => {
    expect(roleOn({ id: OWNER }, storyboard())).toBe('owner')
  })

  it('reads a co-author from the accepted list', () => {
    expect(roleOn({ id: COAUTHOR }, storyboard())).toBe('coauthor')
  })

  it('treats an unaccepted invitation as no role at all', () => {
    // Loaders only put accepted co-authors in coauthorIds; this asserts the
    // consequence rather than the loader.
    expect(roleOn({ id: COAUTHOR }, storyboard({ coauthorIds: [] }))).toBe('reader')
  })

  it('treats a signed-out visitor as a guest', () => {
    expect(roleOn(null, storyboard())).toBe('guest')
  })

  it('does not promote a past contributor', () => {
    // SRS 3.1: contributor status is a historical fact, not a live grant.
    expect(roleOn({ id: STRANGER }, storyboard())).toBe('reader')
  })
})

describe('isAuthor', () => {
  it.each([
    ['owner', true],
    ['coauthor', true],
    ['reader', false],
    ['guest', false],
  ] as const)('%s -> %s', (role, expected) => {
    expect(isAuthor(actorFor(role), storyboard())).toBe(expected)
  })
})

describe('a private storyboard is invisible, not merely read-only', () => {
  const priv = storyboard({ visibility: 'PRIVATE' })

  it('refuses every capability to a signed-in stranger', () => {
    for (const action of MATRIX_ACTIONS) {
      expect(can({ id: STRANGER }, action, priv)).toBe(false)
    }
  })

  it('refuses every capability to a guest', () => {
    for (const action of MATRIX_ACTIONS) {
      expect(can(null, action, priv)).toBe(false)
    }
  })

  it('still lets the owner and co-author work', () => {
    expect(can({ id: OWNER }, 'storyboard:edit', priv)).toBe(true)
    expect(can({ id: COAUTHOR }, 'storyboard:edit', priv)).toBe(true)
  })
})

describe('assertCan', () => {
  it('returns quietly when permitted', () => {
    expect(() => assertCan({ id: OWNER }, 'storyboard:edit', storyboard())).not.toThrow()
  })

  it('denies the existence of a private storyboard to a signed-in stranger', () => {
    // The phase 1 exit criterion. 403 would confirm the storyboard is real.
    const priv = storyboard({ visibility: 'PRIVATE' })
    try {
      assertCan({ id: STRANGER }, 'storyboard:read', priv)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('NOT_FOUND')
    }
  })

  it('denies the existence of a private storyboard to a guest', () => {
    try {
      assertCan(null, 'storyboard:read', storyboard({ visibility: 'PRIVATE' }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as TRPCError).code).toBe('NOT_FOUND')
    }
  })

  it('asks a guest to sign in rather than 404ing a public storyboard', () => {
    // FR-1.2: the account wall sits in front of helping, not reading.
    try {
      assertCan(null, 'suggestion:submit', storyboard())
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as TRPCError).code).toBe('UNAUTHORIZED')
    }
  })

  it('forbids a signed-in reader who simply lacks the capability', () => {
    try {
      assertCan({ id: STRANGER }, 'storyboard:edit', storyboard())
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  it('forbids a co-author the three owner-only capabilities', () => {
    for (const action of [
      'coauthor:invite',
      'storyboard:setVisibility',
      'storyboard:delete',
    ] as const) {
      try {
        assertCan({ id: COAUTHOR }, action, storyboard())
        expect.unreachable(`co-author should not be able to ${action}`)
      } catch (error) {
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    }
  })
})

describe('account status (FR-13.5)', () => {
  it('lets a suspended owner do nothing, including read', () => {
    const suspended: Actor = { id: OWNER, status: 'SUSPENDED' }
    for (const action of MATRIX_ACTIONS) {
      expect(can(suspended, action, storyboard())).toBe(false)
    }
  })

  it('treats an absent status as active', () => {
    expect(can({ id: OWNER }, 'storyboard:edit', storyboard())).toBe(true)
  })
})

describe('soft deletion (FR-2.6)', () => {
  const deleted = storyboard({ deletedAt: new Date('2026-09-01T00:00:00Z') })

  it('keeps it readable by its authors during the grace period', () => {
    expect(can({ id: OWNER }, 'storyboard:read', deleted)).toBe(true)
    expect(can({ id: COAUTHOR }, 'storyboard:read', deleted)).toBe(true)
  })

  it('hides it from everyone else', () => {
    expect(can({ id: STRANGER }, 'storyboard:read', deleted)).toBe(false)
    expect(can(null, 'storyboard:read', deleted)).toBe(false)
  })

  it('refuses every write, even to the owner', () => {
    for (const action of MATRIX_ACTIONS) {
      if (action === 'storyboard:readPublic' || action === 'storyboard:readPrivate') continue
      expect(can({ id: OWNER }, action, deleted)).toBe(false)
    }
  })
})

describe('spinning off (FR-10.7)', () => {
  it('is refused on a private storyboard even for its authors', () => {
    const priv = storyboard({ visibility: 'PRIVATE' })
    expect(can({ id: OWNER }, 'storyboard:spinOff', priv)).toBe(false)
    expect(can({ id: COAUTHOR }, 'storyboard:spinOff', priv)).toBe(false)
  })

  it('is allowed to any signed-in reader on a public storyboard', () => {
    expect(can({ id: STRANGER }, 'storyboard:spinOff', storyboard())).toBe(true)
  })
})

describe('permissionsFor', () => {
  it('gives a component everything it needs without letting it decide', () => {
    expect(permissionsFor({ id: OWNER }, storyboard())).toEqual({
      role: 'owner',
      canEdit: true,
      canStructure: true,
      canOpenRequest: true,
      canRestore: true,
      canCreateVersion: true,
      canInvite: true,
      canSetVisibility: true,
      canDelete: true,
      canSubmitSuggestion: true,
      canPostIdea: true,
      canSpinOff: true,
    })
  })

  it('reports a guest honestly', () => {
    const permissions = permissionsFor(null, storyboard())
    expect(permissions.role).toBe('guest')
    expect(permissions.canEdit).toBe(false)
    expect(permissions.canSubmitSuggestion).toBe(false)
  })
})

describe('pre-switch history stays private (FR-2.7, OD-4 / decision 0007)', () => {
  const wentPublic = new Date('2026-09-14T12:00:00Z')
  const resource = { ...storyboard(), publicFrom: wentPublic }
  const whilePrivate = new Date('2026-09-02T09:00:00Z')
  const afterSwitch = new Date('2026-09-20T09:00:00Z')

  it('shows an author everything', () => {
    expect(canReadRevisionAt({ id: OWNER }, resource, whilePrivate)).toBe(true)
    expect(canReadRevisionAt({ id: COAUTHOR }, resource, whilePrivate)).toBe(true)
  })

  it('hides pre-switch revisions from a reader', () => {
    expect(canReadRevisionAt({ id: STRANGER }, resource, whilePrivate)).toBe(false)
  })

  it('shows post-switch revisions to a reader', () => {
    expect(canReadRevisionAt({ id: STRANGER }, resource, afterSwitch)).toBe(true)
  })

  it('counts the switch instant itself as public', () => {
    expect(canReadRevisionAt({ id: STRANGER }, resource, wentPublic)).toBe(true)
  })

  it('shows a guest nothing on a private storyboard', () => {
    const priv = { ...storyboard({ visibility: 'PRIVATE' }), publicFrom: null }
    expect(canReadRevisionAt(null, priv, whilePrivate)).toBe(false)
  })

  describe('revisionVisibilityWhere agrees with canReadRevisionAt', () => {
    it('does not filter for an author', () => {
      expect(revisionVisibilityWhere({ id: OWNER }, resource)).toEqual({})
    })

    it('filters from the switch point for a reader', () => {
      expect(revisionVisibilityWhere({ id: STRANGER }, resource)).toEqual({
        createdAt: { gte: wentPublic },
      })
    })

    it('fails closed when publicFrom is missing', () => {
      const corrupt = { ...storyboard(), publicFrom: null }
      const where = revisionVisibilityWhere({ id: STRANGER }, corrupt)
      expect(where.createdAt?.gte.getTime()).toBeGreaterThan(Date.now())
      expect(canReadRevisionAt({ id: STRANGER }, corrupt, new Date())).toBe(false)
    })
  })
})
