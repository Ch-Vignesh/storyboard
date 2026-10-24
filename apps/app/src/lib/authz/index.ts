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
  /**
   * Decision 0045 (item 2.7) — may see what moderation has hidden: the
   * administrator, or a sub-admin who holds `reports.decide`. Set by
   * `actorFrom` from the account's role and grants; never from a component.
   */
  moderator?: boolean
} | null

/**
 * The minimum a storyboard has to tell us. Loaders in `guard.ts` select exactly
 * these columns, so a caller cannot forget one and get a wrong answer.
 */
export type StoryboardResource = {
  ownerId: string
  visibility: 'PUBLIC' | 'PRIVATE'
  deletedAt: Date | null
  /** Decision 0045 (item 2.7) — hidden after an upheld report. */
  hiddenAt: Date | null
  /** Accepted co-authors only. An unaccepted invitation grants nothing. */
  coauthorIds: readonly string[]
  /**
   * FR-14.1 — the author has said it is finished: it takes no requests, and
   * nothing new into the ones it had. Not a role question, so the matrix
   * does not read it; the procedures that open things do.
   */
  finished?: boolean
  /** Decision 0039 — stretches spent private after first being public. */
  privateSpans?: ReadonlyArray<{ startedAt: Date; endedAt: Date | null }>
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

/**
 * Decision 0046 (item 2.9) — whether any of the people who blocked this
 * actor is one of the story's authors. An author is never blocked from their
 * own story, whatever the list says. The database half, which finds the
 * list, is `authorsWhoBlocked` in `guard.ts`.
 */
export function blockedByAuthors(
  actor: Actor,
  resource: StoryboardResource,
  blockedBy: readonly string[],
): boolean {
  if (!actor || isAuthor(actor, resource)) return false
  return blockedBy.some(
    (blockerId) => blockerId === resource.ownerId || resource.coauthorIds.includes(blockerId),
  )
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

  // 2b. Hidden after an upheld report (item 2.7, decision 0045): its authors
  //     keep it as it was, a moderator may read it to judge it, and to anyone
  //     else it is not there. Nothing is deleted; "Show it again" undoes it.
  if (resource.hiddenAt !== null && role !== 'owner' && role !== 'coauthor') {
    if (!actor?.moderator) return false
    return !WRITE_ACTIONS.has(matrixAction)
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
 * What a story nobody may read and a story that is not there both answer,
 * word for word. They answered "That storyboard does not exist." and "That
 * story does not exist." until the 2026-10-16 spec review, which told a
 * hidden story from an absent one.
 */
export const STORY_NOT_FOUND = 'That story does not exist.'

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
    throw new TRPCError({ code: 'NOT_FOUND', message: STORY_NOT_FOUND })
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
  /** Decision 0044 (item 7b.1). */
  canPublish: boolean
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
    canPublish: can(actor, 'storyboard:publish', resource),
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
  return !writtenWhilePrivate(resource, revisionCreatedAt)
}

/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — whether a version's public record may
 * name the story it was written in.
 *
 * The record itself is open to anyone with its address: a fingerprint, a
 * time, a word count and a name tell nothing about the words to someone who
 * does not already hold them. The story is the part that could leak, so it is
 * named only to someone who may read that version: the story's own read right
 * (visibility, deletion, hiding), then decision 0007's rule that what was
 * written while it was private stays with its authors. Anyone else reads
 * "a private story", which says no more than that they may not see it.
 */
export function canNameStoryOnRecord(
  actor: Actor,
  resource: StoryboardResource & { publicFrom: Date | null },
  writtenAt: Date,
): boolean {
  return canReadRevisionAt(actor, resource, writtenAt)
}

/**
 * Decision 0039, amending 0007: was the story private at this instant? Before
 * it was first public, or inside a stretch it spent private again after.
 * Writing from either stays with its authors. Until the 2026-10-16 spec
 * review only the first counted, so what was written in a later private
 * stretch became readable the moment the story was republished.
 */
export function writtenWhilePrivate(
  resource: Pick<StoryboardResource, 'privateSpans'> & { publicFrom: Date | null },
  at: Date,
): boolean {
  if (resource.publicFrom === null || at < resource.publicFrom) return true
  return (resource.privateSpans ?? []).some(
    (span) => at >= span.startedAt && (span.endedAt === null || at < span.endedAt),
  )
}

/**
 * The same as a Prisma `where` fragment over one timestamp, so lists filter
 * in the database. Keep it in step with `writtenWhilePrivate`.
 */
function writtenWhilePublicWhere<Field extends 'createdAt' | 'submittedAt'>(
  field: Field,
  resource: Pick<StoryboardResource, 'privateSpans'> & { publicFrom: Date | null },
): Record<Field, { gte: Date }> & {
  NOT?: Array<Record<Field, { gte: Date; lt?: Date }>>
} {
  const after = { [field]: { gte: resource.publicFrom ?? NEVER } } as Record<Field, { gte: Date }>
  const spans = resource.privateSpans ?? []
  if (spans.length === 0) return after
  return {
    ...after,
    NOT: spans.map(
      (span) =>
        ({
          [field]: span.endedAt
            ? { gte: span.startedAt, lt: span.endedAt }
            : { gte: span.startedAt },
        }) as Record<Field, { gte: Date; lt?: Date }>,
    ),
  }
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
): {
  createdAt?: { gte: Date }
  NOT?: Array<{ createdAt: { gte: Date; lt?: Date } }>
} {
  if (isAuthor(actor, resource)) return {}
  return writtenWhilePublicWhere('createdAt', resource)
}

/**
 * Decision 0007 for suggestions, as `revisionVisibilityWhere` is for
 * revisions. Anything sent while the story was private can only have come
 * from its authors, and it stays theirs: until the phase 12 audit it became
 * readable to anyone, through the request page, the suggestion's own page and
 * the writer's profile, the moment the story went public. Unsent drafts have
 * no send time and are governed by who wrote them, not by this.
 */
export function suggestionVisibilityWhere(
  actor: Actor,
  resource: StoryboardResource & { publicFrom: Date | null },
): {
  OR?: Array<
    | { submittedAt: null }
    | ({ submittedAt: { gte: Date } } & {
        NOT?: Array<{ submittedAt: { gte: Date; lt?: Date } }>
      })
  >
} {
  if (isAuthor(actor, resource)) return {}
  return { OR: [{ submittedAt: null }, writtenWhilePublicWhere('submittedAt', resource)] }
}

/** The same rule for one suggestion already in hand. */
export function canReadSuggestionSentAt(
  actor: Actor,
  resource: StoryboardResource & { publicFrom: Date | null },
  submittedAt: Date | null,
): boolean {
  if (isAuthor(actor, resource) || !submittedAt) return true
  return !writtenWhilePrivate(resource, submittedAt)
}
