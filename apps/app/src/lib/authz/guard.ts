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

import {
  assertCan,
  can,
  permissionsFor,
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
  publicFrom: true,
  collaborators: {
    // Accepted co-authors only: an outstanding invitation grants nothing.
    where: { acceptedAt: { not: null } },
    select: { userId: true },
  },
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
    publicFrom: row.publicFrom,
    coauthorIds: row.collaborators.map((c) => c.userId),
  }
}

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'That storyboard does not exist.' })

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
): Promise<StoryboardContext & { versionId: string; isMain: boolean }> {
  const version = await db.version.findUnique({
    where: { id: versionId },
    select: { id: true, isMain: true, storyboard: { select: AUTHZ_SELECT } },
  })
  if (!version) throw notFound()

  const resource = toResource(version.storyboard)
  assertCan(actor, action, resource)

  return {
    storyboardId: version.storyboard.id,
    resource,
    permissions: permissionsFor(actor, resource),
    versionId: version.id,
    isMain: version.isMain,
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

  if (!actor) return { ...base, visibility: 'PUBLIC' }

  return {
    ...base,
    OR: [
      { visibility: 'PUBLIC' },
      { ownerId: actor.id },
      { collaborators: { some: { userId: actor.id, acceptedAt: { not: null } } } },
    ],
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
