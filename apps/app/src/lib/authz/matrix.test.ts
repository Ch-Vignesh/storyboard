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
  type Actor,
  assertCan,
  blockedByAuthors,
  can,
  canNameStoryOnRecord,
  canReadRevisionAt,
  canReadSuggestionSentAt,
  isAuthor,
  MATRIX,
  MATRIX_ACTIONS,
  type MatrixAction,
  permissionsFor,
  revisionVisibilityWhere,
  type Role,
  roleOn,
  ROLES,
  STORY_NOT_FOUND,
  type StoryboardResource,
  suggestionVisibilityWhere,
  writtenWhilePrivate,
} from './index'
import { visibleStoryboardsWhere } from './guard'

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
    hiddenAt: null,
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
    expect(MATRIX_ACTIONS).toHaveLength(17)
    for (const action of MATRIX_ACTIONS) {
      expect(Object.keys(MATRIX[action]).sort()).toEqual([...ROLES].sort())
    }
  })

  // 17 capabilities x 4 roles = 68 cells, one test each.
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
      // The sentence a story that is not there gets, too (guard.ts).
      expect((error as TRPCError).message).toBe(STORY_NOT_FOUND)
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
  /**
   * This used to assert that a suspended account could do nothing at all,
   * reading included. Decision 0018 narrowed it in phase 6: a suspension
   * freezes the person, not the work, and a suspended person reading a public
   * storyboard is doing what any stranger may do. `trust.test.ts` covers the
   * new rule from both sides; what stays here is that writing stops dead.
   */
  it('lets a suspended owner write nothing at all', () => {
    const suspended: Actor = { id: OWNER, status: 'SUSPENDED' }
    for (const action of MATRIX_ACTIONS) {
      if (action === 'storyboard:readPublic' || action === 'storyboard:readPrivate') continue
      expect(can(suspended, action, storyboard()), action).toBe(false)
    }
  })

  it('leaves reading alone, which is the whole of decision 0018', () => {
    const suspended: Actor = { id: OWNER, status: 'SUSPENDED' }
    expect(can(suspended, 'storyboard:read', storyboard())).toBe(true)
  })

  it('lets a deleted account do nothing, including read', () => {
    const deleted: Actor = { id: OWNER, status: 'DELETED' }
    for (const action of MATRIX_ACTIONS) {
      expect(can(deleted, action, storyboard()), action).toBe(false)
    }
  })

  it('treats an absent status as active', () => {
    expect(can({ id: OWNER }, 'storyboard:edit', storyboard())).toBe(true)
  })

  /**
   * Decision 0024. An account inside its deletion grace period is frozen the
   * way a suspended one is — and for a different reason. Suspension is
   * "pending review"; this is "you asked to go". Both come out the same: read,
   * because they can still sign in and change their mind, and write nothing,
   * because seven days of new work is seven days of new work to decide the
   * fate of.
   */
  it('freezes writing for an account that has asked to be deleted', () => {
    const leaving: Actor = { id: OWNER, status: 'ACTIVE', deletionRequestedAt: new Date() }
    expect(can(leaving, 'storyboard:edit', storyboard())).toBe(false)
    expect(can(leaving, 'request:open', storyboard())).toBe(false)
  })

  it('still lets them read, because the undo is behind a sign-in', () => {
    const leaving: Actor = { id: OWNER, status: 'ACTIVE', deletionRequestedAt: new Date() }
    expect(can(leaving, 'storyboard:read', storyboard())).toBe(true)
  })

  it('unfreezes the moment the request is withdrawn', () => {
    const stayed: Actor = { id: OWNER, status: 'ACTIVE', deletionRequestedAt: null }
    expect(can(stayed, 'storyboard:edit', storyboard())).toBe(true)
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
      canExport: true,
      canPublish: true,
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

describe('a later private stretch stays private too (FR-2.7, decision 0039)', () => {
  const wentPublic = new Date('2026-09-14T12:00:00Z')
  const wentPrivate = new Date('2026-10-01T12:00:00Z')
  const publicAgain = new Date('2026-10-10T12:00:00Z')
  const resource = {
    ...storyboard(),
    publicFrom: wentPublic,
    privateSpans: [{ startedAt: wentPrivate, endedAt: publicAgain }],
  }
  const before = new Date('2026-09-20T09:00:00Z')
  const during = new Date('2026-10-05T09:00:00Z')
  const after = new Date('2026-10-12T09:00:00Z')

  it('hides from a reader what was written while it was private again', () => {
    expect(canReadRevisionAt({ id: STRANGER }, resource, during)).toBe(false)
    expect(canReadSuggestionSentAt({ id: STRANGER }, resource, during)).toBe(false)
  })

  it('keeps what was public before, and what came after', () => {
    expect(canReadRevisionAt({ id: STRANGER }, resource, before)).toBe(true)
    expect(canReadRevisionAt({ id: STRANGER }, resource, after)).toBe(true)
    // Its first instant private is private; its first instant public again is not.
    expect(writtenWhilePrivate(resource, wentPrivate)).toBe(true)
    expect(writtenWhilePrivate(resource, publicAgain)).toBe(false)
  })

  it('shows an author all of it', () => {
    expect(canReadRevisionAt({ id: OWNER }, resource, during)).toBe(true)
  })

  it('says the same in the database query', () => {
    expect(revisionVisibilityWhere({ id: STRANGER }, resource)).toEqual({
      createdAt: { gte: wentPublic },
      NOT: [{ createdAt: { gte: wentPrivate, lt: publicAgain } }],
    })
    expect(suggestionVisibilityWhere({ id: STRANGER }, resource)).toEqual({
      OR: [
        { submittedAt: null },
        {
          submittedAt: { gte: wentPublic },
          NOT: [{ submittedAt: { gte: wentPrivate, lt: publicAgain } }],
        },
      ],
    })
  })
})

/**
 * SRS section 2 (phase 14, item 1.13) — the labels reach the screen: the error
 * formatter shows "You do not have permission to do that (…)" to the person,
 * so a label is interface copy and keeps to the interface's words. The
 * vocabulary linter does not read this folder (item 10.4 widens it), so this
 * holds the line meanwhile, with the linter's own terms.
 */
describe('the action labels speak the interface’s words', () => {
  const BANNED = [
    /\bbranch(?:es|ed|ing)?\b/i,
    /\bmerg(?:e|es|ed|ing)\b/i,
    /\bcommit(?:s|ted|ting)?\b/i,
    /\bfork(?:s|ed|ing)?\b/i,
    /\bpull[ -]requests?\b/i,
    /\bdiffs?\b/i,
    /\brepositor(?:y|ies)\b/i,
    /\bstoryboards?\b/i,
  ]

  it('uses no banned term in any label', () => {
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      for (const pattern of BANNED) {
        expect(label, `${action}: "${label}" matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('reaches the person as a sentence', () => {
    const resource = storyboard({ ownerId: OWNER })
    expect(() => assertCan({ id: STRANGER }, 'storyboard:delete', resource)).toThrowError(
      /^You do not have permission to do that \(Delete a story\)\.$/,
    )
  })
})

describe('hidden after a report (phase 14, item 2.7; decision 0045)', () => {
  const hidden = storyboard({ hiddenAt: new Date('2026-10-18T00:00:00Z') })
  const moderator: Actor = { id: 'user_moderator', status: 'ACTIVE', moderator: true }

  it('is not there for a guest or a reader, exactly as if it did not exist', () => {
    expect(can(null, 'storyboard:read', hidden)).toBe(false)
    expect(can(actorFor('reader'), 'storyboard:read', hidden)).toBe(false)
    expect(can(actorFor('reader'), 'suggestion:submit', hidden)).toBe(false)
    expect(() => assertCan(actorFor('reader'), 'storyboard:read', hidden)).toThrow(STORY_NOT_FOUND)
  })

  it('stays as it was for its authors', () => {
    expect(can(actorFor('owner'), 'storyboard:read', hidden)).toBe(true)
    expect(can(actorFor('owner'), 'storyboard:edit', hidden)).toBe(true)
    expect(can(actorFor('coauthor'), 'storyboard:edit', hidden)).toBe(true)
  })

  it('may be read by a moderator, and not written to', () => {
    expect(can(moderator, 'storyboard:read', hidden)).toBe(true)
    expect(
      can(
        moderator,
        'storyboard:read',
        storyboard({ hiddenAt: new Date(), visibility: 'PRIVATE' }),
      ),
    ).toBe(true)
    expect(can(moderator, 'suggestion:submit', hidden)).toBe(false)
    expect(can(moderator, 'storyboard:edit', hidden)).toBe(false)
    // And nothing more than anyone else on a story that is not hidden.
    expect(can(moderator, 'storyboard:read', storyboard({ visibility: 'PRIVATE' }))).toBe(false)
  })

  it('is listed for its authors and a moderator, and for nobody else', () => {
    expect(JSON.stringify(visibleStoryboardsWhere(null))).toContain('"hiddenAt":null')
    expect(JSON.stringify(visibleStoryboardsWhere(actorFor('reader')))).toContain('"hiddenAt":null')
    expect(JSON.stringify(visibleStoryboardsWhere(moderator))).not.toContain('hiddenAt')
  })
})

/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — a version's public record is open to
 * anyone; the story it was written in is named only to someone who may read
 * that version. One cell per role and kind of story.
 */
describe('the public record of a version names its story (item 8.12)', () => {
  const wentPublic = new Date('2026-09-14T12:00:00Z')
  const written = new Date('2026-09-20T09:00:00Z')
  const writtenBefore = new Date('2026-09-02T09:00:00Z')
  const moderator: Actor = { id: 'user_moderator', status: 'ACTIVE', moderator: true }

  const cases: Array<[string, StoryboardResource & { publicFrom: Date | null }, Date]> = [
    ['a public story', { ...storyboard(), publicFrom: wentPublic }, written],
    ['a private story', { ...storyboard({ visibility: 'PRIVATE' }), publicFrom: null }, written],
    [
      'a version written before a story went public',
      { ...storyboard(), publicFrom: wentPublic },
      writtenBefore,
    ],
    [
      'a story hidden after a report',
      { ...storyboard({ hiddenAt: new Date('2026-10-01T00:00:00Z') }), publicFrom: wentPublic },
      written,
    ],
    [
      'a deleted story',
      { ...storyboard({ deletedAt: new Date('2026-10-01T00:00:00Z') }), publicFrom: wentPublic },
      written,
    ],
  ]
  const expected: Record<string, Record<Role, boolean>> = {
    'a public story': { owner: true, coauthor: true, reader: true, guest: true },
    'a private story': { owner: true, coauthor: true, reader: false, guest: false },
    'a version written before a story went public': {
      owner: true,
      coauthor: true,
      reader: false,
      guest: false,
    },
    'a story hidden after a report': { owner: true, coauthor: true, reader: false, guest: false },
    'a deleted story': { owner: true, coauthor: true, reader: false, guest: false },
  }

  for (const [label, resource, writtenAt] of cases) {
    describe(label, () => {
      for (const role of ROLES) {
        const answer = expected[label]?.[role]
        it(`${role} ${answer ? 'sees' : 'does not see'} the story's name`, () => {
          expect(canNameStoryOnRecord(actorFor(role), resource, writtenAt)).toBe(answer)
          // The same answer the history gives for that version (decision 0007).
          expect(canNameStoryOnRecord(actorFor(role), resource, writtenAt)).toBe(
            canReadRevisionAt(actorFor(role), resource, writtenAt),
          )
        })
      }
    })
  }

  it('names a hidden story to a moderator, who may read it to judge it', () => {
    const [, hidden, writtenAt] = cases[3] ?? []
    if (!hidden || !writtenAt) throw new Error('missing case')
    expect(canNameStoryOnRecord(moderator, hidden, writtenAt)).toBe(true)
  })

  it('names nothing to a deleted account', () => {
    const gone: Actor = { id: OWNER, status: 'DELETED' }
    expect(canNameStoryOnRecord(gone, { ...storyboard(), publicFrom: wentPublic }, written)).toBe(
      false,
    )
  })
})

describe('blocked by an author (phase 14, item 2.9; decision 0046)', () => {
  const story = storyboard()

  it('keeps out someone the owner or a co-author has blocked', () => {
    expect(blockedByAuthors(actorFor('reader'), story, [OWNER])).toBe(true)
    expect(blockedByAuthors(actorFor('reader'), story, [COAUTHOR])).toBe(true)
    expect(blockedByAuthors(actorFor('reader'), story, ['user_someone_else'])).toBe(false)
    expect(blockedByAuthors(actorFor('reader'), story, [])).toBe(false)
  })

  it('never keeps an author or a guest out', () => {
    expect(blockedByAuthors(actorFor('coauthor'), story, [OWNER])).toBe(false)
    expect(blockedByAuthors(actorFor('owner'), story, [COAUTHOR])).toBe(false)
    expect(blockedByAuthors(null, story, [OWNER])).toBe(false)
  })
})
