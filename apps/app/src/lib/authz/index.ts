/**
 * Authorisation (architecture section 7, NFR-6).
 *
 * One function, called at the data layer, never in a route handler and never in
 * a component. Components read a `permissions` object the server already
 * computed; they do not decide. This is the difference between a bug that hides
 * a button and a bug that leaks an unpublished manuscript.
 *
 * `matrix.ts` holds the role/capability table from SRS section 3.2. This file
 * holds everything that depends on the resource: visibility, soft deletion,
 * account status, and the rule that you cannot act on what you cannot see.
 */

import { TRPCError } from '@trpc/server'

import { SUGGESTION_QUOTA } from '@/lib/schemas/constants'

import { ACTION_LABELS, MATRIX, WRITE_ACTIONS, type MatrixAction, type Role } from './matrix'

export { ACTION_LABELS, MATRIX, MATRIX_ACTIONS, ROLES } from './matrix'
export type { MatrixAction, Role } from './matrix'

/**
 * `storyboard:read` is sugar: it resolves to the public or the private row of
 * the matrix according to the resource, so callers never have to ask which.
 */
export type Action = MatrixAction | 'storyboard:read'

/**
 * The signed-in user, or `null` for a guest. `status` is carried because a
 * suspended account keeps reading and stops writing (FR-13.5); it is checked
 * here rather than in fifteen routers.
 */
export type Actor = {
  id: string
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  /**
   * Set while an account is inside its deletion grace period (decision 0024).
   * They can still sign in — they have to, to change their mind — and they
   * write nothing in the meantime, exactly like a suspended account.
   */
  deletionRequestedAt?: Date | null
} | null

/**
 * The minimum a storyboard has to tell us. Loaders in `guard.ts` select exactly
 * these columns, so a caller cannot forget one and get a wrong answer.
 */
export type StoryboardResource = {
  ownerId: string
  visibility: 'PUBLIC' | 'PRIVATE'
  deletedAt: Date | null
  /** Accepted co-authors only. An unaccepted invitation grants nothing. */
  coauthorIds: readonly string[]
}

/** Which row of the matrix this actor sits on for this storyboard. */
export function roleOn(actor: Actor, resource: StoryboardResource): Role {
  if (!actor) return 'guest'
  if (actor.id === resource.ownerId) return 'owner'
  if (resource.coauthorIds.includes(actor.id)) return 'coauthor'
  return 'reader'
}

/**
 * FR-13.2 and decision 0016 — how many submitted suggestions this person may
 * hold on this storyboard at once.
 *
 * Here rather than in `suggestion.submit` because it is a question about what a
 * role may do, and NFR-6 says those are answered at the data layer. The caller
 * still counts inside its own transaction; this only says what to count to.
 */
export function quotaFor(actor: Actor, resource: StoryboardResource): number {
  switch (roleOn(actor, resource)) {
    case 'owner':
      return SUGGESTION_QUOTA.owner
    case 'coauthor':
      return SUGGESTION_QUOTA.coauthor
    case 'reader':
    case 'guest':
      return SUGGESTION_QUOTA.contributor
  }
}

/** True when the actor is the owner or an accepted co-author. */
export function isAuthor(actor: Actor, resource: StoryboardResource): boolean {
  const role = roleOn(actor, resource)
  return role === 'owner' || role === 'coauthor'
}

/** The matrix row a bare `storyboard:read` means for this resource. */
function resolve(action: Action, resource: StoryboardResource): MatrixAction {
  if (action !== 'storyboard:read') return action
  return resource.visibility === 'PUBLIC' ? 'storyboard:readPublic' : 'storyboard:readPrivate'
}

/**
 * The whole authorisation decision.
 *
 * Resource rules, applied in this order and each one deliberate:
 *
 * 1. A deleted or suspended account can do nothing at all.
 * 2. A soft-deleted storyboard (FR-2.6) is visible only to its authors during
 *    the 30-day grace, and cannot be written to by anyone.
 * 3. You cannot do anything to a storyboard you cannot read. This single rule
 *    is what keeps a private manuscript invisible rather than merely
 *    unwritable, and it is why the read check comes before the table.
 * 4. Spinning off requires a public storyboard (FR-10.7) — the people who can
 *    read a private one are its authors, who have alternate versions instead.
 * 5. Otherwise the table decides.
 */
export function can(actor: Actor, action: Action, resource: StoryboardResource): boolean {
  const matrixAction = resolve(action, resource)
  const role = roleOn(actor, resource)

  // 1. A suspended account writes nothing (FR-13.5). Reading is left alone:
  //    decision 0018 freezes the person, not the work, and a suspended person
  //    reading a public storyboard is doing what any stranger may do. A deleted
  //    account is inert entirely.
  //    An account inside its deletion grace period is treated the same way:
  //    it can read, because it can still sign in to change its mind, and it
  //    writes nothing, because seven days of new work would be seven days of
  //    new work to decide the fate of (decision 0024).
  if (actor?.status === 'DELETED') return false
  if (actor?.status === 'SUSPENDED' && WRITE_ACTIONS.has(matrixAction)) return false
  if (actor?.deletionRequestedAt && WRITE_ACTIONS.has(matrixAction)) return false

  // 2. Soft-deleted: authors only, and read-only even for them.
  if (resource.deletedAt !== null) {
    if (role !== 'owner' && role !== 'coauthor') return false
    if (WRITE_ACTIONS.has(matrixAction)) return false
    return true
  }

  // 3. No action on an unreadable storyboard.
  const canRead =
    resource.visibility === 'PUBLIC'
      ? MATRIX['storyboard:readPublic'][role]
      : MATRIX['storyboard:readPrivate'][role]
  if (!canRead) return false

  // 4. FR-10.7.
  if (matrixAction === 'storyboard:spinOff' && resource.visibility !== 'PUBLIC') return false

  // 5. The table.
  return MATRIX[matrixAction][role]
}

/**
 * `can()` with the error the API should return when the answer is no.
 *
 * The distinction matters and is the reason this is not three lines inline:
 *
 * - Cannot even read it -> NOT_FOUND. A stranger must not be able to learn
 *   that a private storyboard exists by probing routes (phase 1 exit
 *   criterion). Never FORBIDDEN here; 403 confirms the thing is real.
 * - Can read it but is signed out -> UNAUTHORIZED, so the client can show the
 *   "sign in to help" affordance (FR-1.2) instead of a dead end.
 * - Signed in, can read, lacks the capability -> FORBIDDEN.
 */
export function assertCan(actor: Actor, action: Action, resource: StoryboardResource): void {
  if (can(actor, action, resource)) return

  if (!can(actor, 'storyboard:read', resource)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That storyboard does not exist.' })
  }

  if (!actor) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' })
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `You do not have permission to do that (${ACTION_LABELS[resolve(action, resource)]}).`,
  })
}

/**
 * What the server tells a component it may do, so the component never decides
 * (architecture section 7). Extend this as screens need it rather than letting
 * a component reach for `can()` itself.
 */
export type StoryboardPermissions = {
  role: Role
  canEdit: boolean
  canStructure: boolean
  canOpenRequest: boolean
  canRestore: boolean
  canCreateVersion: boolean
  canInvite: boolean
  canSetVisibility: boolean
  canDelete: boolean
  canSubmitSuggestion: boolean
  canPostIdea: boolean
  canSpinOff: boolean
  canExport: boolean
}

export function permissionsFor(actor: Actor, resource: StoryboardResource): StoryboardPermissions {
  return {
    role: roleOn(actor, resource),
    canEdit: can(actor, 'storyboard:edit', resource),
    canStructure: can(actor, 'storyboard:structure', resource),
    canOpenRequest: can(actor, 'request:open', resource),
    canRestore: can(actor, 'revision:restore', resource),
    canCreateVersion: can(actor, 'version:create', resource),
    canInvite: can(actor, 'coauthor:invite', resource),
    canSetVisibility: can(actor, 'storyboard:setVisibility', resource),
    canDelete: can(actor, 'storyboard:delete', resource),
    canSubmitSuggestion: can(actor, 'suggestion:submit', resource),
    canPostIdea: can(actor, 'idea:post', resource),
    canSpinOff: can(actor, 'storyboard:spinOff', resource),
    canExport: can(actor, 'storyboard:export', resource),
  }
}

/**
 * FR-2.7 with OD-4 resolved as "hide pre-switch history" (decision 0007).
 *
 * A revision written while the storyboard was private stays private after the
 * switch to public. Authors see everything; everyone else sees revisions from
 * `publicFrom` onwards. A storyboard that has always been public has
 * `publicFrom` set at creation, so this is a no-op for it.
 */
export function canReadRevisionAt(
  actor: Actor,
  resource: StoryboardResource & { publicFrom: Date | null },
  revisionCreatedAt: Date,
): boolean {
  if (!can(actor, 'storyboard:read', resource)) return false
  if (isAuthor(actor, resource)) return true
  if (resource.publicFrom === null) return false
  return revisionCreatedAt.getTime() >= resource.publicFrom.getTime()
}

/**
 * Matches no revision. A public storyboard always has `publicFrom` set — it is
 * stamped at creation and on the switch to public, and never cleared — so a
 * null on a readable storyboard means the data is wrong. Showing nothing makes
 * that loud and obvious; showing everything would leak private drafts quietly.
 * Both failure modes are bugs, and only one of them is safe.
 */
const NEVER = new Date(8_640_000_000_000_000)

/**
 * The same rule as a Prisma `where` fragment, so a list query filters in the
 * database rather than fetching every revision and discarding rows in
 * JavaScript. Keep this in step with `canReadRevisionAt`; they must agree.
 */
export function revisionVisibilityWhere(
  actor: Actor,
  resource: StoryboardResource & { publicFrom: Date | null },
): { createdAt?: { gte: Date } } {
  if (isAuthor(actor, resource)) return {}
  return { createdAt: { gte: resource.publicFrom ?? NEVER } }
}
