/**
 * The data layer's half of authorisation (NFR-6).
 *
 * `index.ts` decides; these functions are the only sanctioned way to *fetch* a
 * storyboard, chapter or section in a router. Every one of them loads the
 * storyboard, resolves the actor's role against it and throws before returning
 * a row. A router that reaches for `ctx.db.storyboard.findUnique` directly has
 * bypassed the check — that is the bug this file exists to make unnecessary.
 *
 * They take a Prisma client rather than a tRPC context so they can be used
 * inside a `$transaction` (where `tx` replaces `db`) and from the seed.
 */

import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'

import { BLOCKED_FROM_HELPING } from '@/lib/schemas/help'

import {
  assertCan,
  blockedByAuthors,
  can,
  isAuthor,
  permissionsFor,
  STORY_NOT_FOUND,
  type Action,
  type Actor,
  type StoryboardResource,
} from './index'

/** A transaction client and the full client both satisfy this. */
type Db = PrismaClient | Prisma.TransactionClient

/**
 * The columns authorisation needs, and no others. Selecting exactly this shape
 * everywhere means a loader cannot forget `deletedAt` and quietly hand a
 * deleted storyboard to `can()`.
 */
const AUTHZ_SELECT = {
  id: true,
  ownerId: true,
  visibility: true,
  state: true,
  deletedAt: true,
  hiddenAt: true,
  publicFrom: true,
  collaborators: {
    // Accepted co-authors only: an outstanding invitation grants nothing.
    where: { acceptedAt: { not: null } },
    select: { userId: true },
  },
  privateSpans: { select: { startedAt: true, endedAt: true } },
} satisfies Prisma.StoryboardSelect

type LoadedStoryboard = Prisma.StoryboardGetPayload<{ select: typeof AUTHZ_SELECT }>

/** A storyboard plus everything the caller needs to decide what to show. */
export type StoryboardContext = {
  storyboardId: string
  resource: StoryboardResource & { publicFrom: Date | null }
  permissions: ReturnType<typeof permissionsFor>
}

function toResource(row: LoadedStoryboard): StoryboardResource & { publicFrom: Date | null } {
  return {
    ownerId: row.ownerId,
    visibility: row.visibility,
    deletedAt: row.deletedAt,
    hiddenAt: row.hiddenAt,
    publicFrom: row.publicFrom,
    coauthorIds: row.collaborators.map((c) => c.userId),
    finished: row.state === 'FINISHED',
    privateSpans: row.privateSpans,
  }
}

/**
 * FR-14.1 — for the procedures that would open something on a finished
 * story. They were open to it until the 2026-10-16 spec review: finishing
 * closed the requests, and nothing stopped them being reopened, or new ones
 * opened, and so listed in browse.
 */
export function assertNotFinished(
  resource: StoryboardResource,
  asked: 'by the author' | 'by a helper' = 'by the author',
): void {
  if (!resource.finished) return
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message:
      asked === 'by the author'
        ? 'This story is marked finished, so it is not asking for help. To ask, choose “Actually, there is more to do” on its Take it out page first.'
        : 'This story has been marked finished, so it is not taking suggestions any more. Yours stays on your profile.',
  })
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: STORY_NOT_FOUND })

/**
 * Load a storyboard by id or slug and assert the action against it.
 *
 * A missing row and an unreadable row produce the same NOT_FOUND, so probing
 * URLs cannot distinguish "no such storyboard" from "not yours".
 */
export async function loadStoryboard(
  db: Db,
  actor: Actor,
  where: { id: string } | { slug: string } | { publicId: string },
  action: Action = 'storyboard:read',
): Promise<StoryboardContext> {
  const row = await db.storyboard.findUnique({ where, select: AUTHZ_SELECT })
  if (!row) throw notFound()

  const resource = toResource(row)
  assertCan(actor, action, resource)

  return {
    storyboardId: row.id,
    resource,
    permissions: permissionsFor(actor, resource),
  }
}

/** `loadStoryboard` for the common "must be owner or co-author" case. */
export async function loadStoryboardAsAuthor(
  db: Db,
  actor: Actor,
  where: { id: string } | { slug: string } | { publicId: string },
  action: Action = 'storyboard:edit',
): Promise<StoryboardContext> {
  return loadStoryboard(db, actor, where, action)
}

/**
 * Resolve a version to its storyboard and check it. Versions are addressed
 * directly by the editor and the history panel, so this is the hot path for
 * "does this person get to touch this tree at all".
 */
export async function loadVersion(
  db: Db,
  actor: Actor,
  versionId: string,
  action: Action = 'storyboard:read',
  options: { allowDeleted?: boolean } = {},
): Promise<StoryboardContext & { versionId: string; isMain: boolean; deletedAt: Date | null }> {
  const version = await db.version.findUnique({
    where: { id: versionId },
    select: { id: true, isMain: true, deletedAt: true, storyboard: { select: AUTHZ_SELECT } },
  })
  if (!version) throw notFound()

  const resource = toResource(version.storyboard)
  assertCan(actor, action, resource)

  // FR-10.1 (phase 14, item 1.1) — a removed alternate is not there, for
  // reading, comparing, exporting and renaming alike. The one caller that
  // wants to say *why* it refuses, rather than "not found", asks for it.
  if (version.deletedAt && !options.allowDeleted) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
  }

  return {
    storyboardId: version.storyboard.id,
    resource,
    permissions: permissionsFor(actor, resource),
    versionId: version.id,
    isMain: version.isMain,
    deletedAt: version.deletedAt,
  }
}

/** Resolve a chapter through its version to its storyboard, and check it. */
export async function loadChapter(
  db: Db,
  actor: Actor,
  chapterId: string,
  action: Action = 'storyboard:read',
): Promise<StoryboardContext & { chapterId: string; versionId: string }> {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      versionId: true,
      version: { select: { storyboard: { select: AUTHZ_SELECT } } },
    },
  })
  if (!chapter) throw notFound()

  const resource = toResource(chapter.version.storyboard)
  assertCan(actor, action, resource)

  return {
    storyboardId: chapter.version.storyboard.id,
    resource,
    permissions: permissionsFor(actor, resource),
    chapterId: chapter.id,
    versionId: chapter.versionId,
  }
}

/**
 * Resolve a section through chapter and version to its storyboard, and check
 * it. The section is the atomic unit of contribution, so almost every write in
 * the product comes through here.
 */
export async function loadSection(
  db: Db,
  actor: Actor,
  sectionId: string,
  action: Action = 'storyboard:read',
): Promise<
  StoryboardContext & {
    sectionId: string
    chapterId: string
    versionId: string
    currentRevisionId: string | null
    wordCount: number
  }
> {
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      chapterId: true,
      currentRevisionId: true,
      wordCount: true,
      deletedAt: true,
      mergedIntoId: true,
      chapter: {
        select: {
          versionId: true,
          version: { select: { storyboard: { select: AUTHZ_SELECT } } },
        },
      },
    },
  })
  if (!section) throw notFound()

  const resource = toResource(section.chapter.version.storyboard)
  assertCan(actor, action, resource)

  // A section that was deleted, or joined into the one above, keeps its
  // history for reading (FR-2.4) and takes nothing new. Until the phase 12
  // audit it did: a second click on "Join with the one above" joined the same
  // text in twice, and a co-author went on saving into a section that was no
  // longer in the story.
  if (action !== 'storyboard:read' && (section.deletedAt || section.mergedIntoId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That section is no longer in this story.' })
  }

  return {
    storyboardId: section.chapter.version.storyboard.id,
    resource,
    permissions: permissionsFor(actor, resource),
    sectionId: section.id,
    chapterId: section.chapterId,
    versionId: section.chapter.versionId,
    currentRevisionId: section.currentRevisionId,
    wordCount: section.wordCount,
  }
}

/**
 * The `where` fragment that limits a *list* of storyboards to what this actor
 * may see. Used by browse and by anything that counts storyboards; the loaders
 * above cover the single-row case.
 */
export function visibleStoryboardsWhere(actor: Actor): Prisma.StoryboardWhereInput {
  const base: Prisma.StoryboardWhereInput = { deletedAt: null }
  // Hidden after a report (item 2.7, decision 0045): listed for its authors
  // and for a moderator, and for nobody else.
  const open: Prisma.StoryboardWhereInput = actor?.moderator
    ? { visibility: 'PUBLIC' }
    : { visibility: 'PUBLIC', hiddenAt: null }

  if (!actor) return { ...base, ...open }

  return {
    ...base,
    OR: [
      open,
      { ownerId: actor.id },
      { collaborators: { some: { userId: actor.id, acceptedAt: { not: null } } } },
    ],
  }
}

/**
 * The `where` fragment for the stories a person writes: their own, and the
 * ones they were invited to and accepted. The dashboard's own lists read it
 * (FR-11.1; phase 14, item 6.14).
 */
export function authoredStoryboardsWhere(userId: string): Prisma.StoryboardWhereInput {
  return {
    deletedAt: null,
    OR: [{ ownerId: userId }, { collaborators: { some: { userId, acceptedAt: { not: null } } } }],
  }
}

/**
 * The stories anyone may see listed: public, not deleted, not hidden. For the
 * lists that have no actor at hand and show the same to everyone, such as a
 * public profile's credits and the Sunday digest.
 */
export const PUBLICLY_LISTED = {
  visibility: 'PUBLIC',
  deletedAt: null,
  hiddenAt: null,
} as const satisfies Prisma.StoryboardWhereInput

/**
 * Decision 0046 (item 2.9) — someone an author has blocked cannot start, send
 * or post help on that author's story; they still read it. One indexed query,
 * asked only where help begins (the request page and the write procedures),
 * never on every read.
 */
export async function blockedFromHelping(
  db: Db,
  actor: Actor,
  resource: StoryboardResource,
): Promise<boolean> {
  if (!actor || isAuthor(actor, resource)) return false
  const blocks = await db.userBlock.findMany({
    where: { blockedId: actor.id, blockerId: { in: [resource.ownerId, ...resource.coauthorIds] } },
    select: { blockerId: true },
  })
  return blockedByAuthors(
    actor,
    resource,
    blocks.map((block) => block.blockerId),
  )
}

/** The refusal, in the words the screen shows (item 2.9, D-9). */
export async function assertNotBlocked(
  db: Db,
  actor: Actor,
  resource: StoryboardResource,
): Promise<void> {
  if (await blockedFromHelping(db, actor, resource)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: BLOCKED_FROM_HELPING })
  }
}

/** True when the actor may read the storyboard; for callers that want no throw. */
export async function canReadStoryboard(
  db: Db,
  actor: Actor,
  where: { id: string } | { slug: string },
): Promise<boolean> {
  const row = await db.storyboard.findUnique({ where, select: AUTHZ_SELECT })
  return row ? can(actor, 'storyboard:read', toResource(row)) : false
}
