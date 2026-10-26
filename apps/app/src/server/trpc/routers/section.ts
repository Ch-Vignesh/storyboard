import { randomUUID } from 'node:crypto'

import type { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadChapter, loadSection } from '@/lib/authz/guard'
import { afterCommit } from '@/server/after-commit'
import { recordEvent } from '@/server/audit'
import { closeRequestsOnSections } from '@/server/close-requests'
import { sectionsRequestImpact } from '@/server/impact'
import type { Person } from '@/lib/people'
import { assertCan, isAuthor, revisionVisibilityWhere } from '@/lib/authz'
import {
  emptyDoc,
  flavourForStoryType,
  parseDoc,
  type DocFlavour,
  type StoryboardDoc,
} from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { HISTORY, SOFT_DELETE_GRACE_DAYS, TITLE_MAX_CHARS } from '@/lib/schemas/constants'
import { passChipSchema } from '@/lib/schemas/help'
import { logger } from '@/lib/logger'

import {
  activeProcedure,
  actorFrom,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../init'

const log = logger.child({ router: 'section' })

const titleSchema = z.string().trim().max(TITLE_MAX_CHARS, 'That name is too long.').nullish()

/** Untrusted document JSON. Shape is checked against the flavour on arrival. */
const docInput = z.unknown()

/** The node set this storyboard's sections use (FR-4.2), for parsing documents. */
async function flavourOf(db: Prisma.TransactionClient, storyboardId: string): Promise<DocFlavour> {
  const storyboard = await db.storyboard.findUniqueOrThrow({
    where: { id: storyboardId },
    select: { type: true },
  })
  return flavourForStoryType(storyboard.type)
}

export const sectionRouter = createTRPCRouter({
  /**
   * A section with its current text, plus this reader's private draft if they
   * have one (FR-4.5). Public so a guest can read a public storyboard (FR-1.2);
   * the loader decides whether they may.
   */
  get: publicProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, storyboardId, permissions } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
      )

      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: {
          id: true,
          title: true,
          order: true,
          wordCount: true,
          lineageId: true,
          chapterId: true,
          mergedIntoId: true,
          deletedAt: true,
          currentRevision: {
            select: {
              id: true,
              contentJson: true,
              wordCount: true,
              contentHash: true,
              createdAt: true,
              source: true,
              author: { select: { id: true, username: true, displayName: true } },
            },
          },
        },
      })

      const saved = actor
        ? await ctx.db.sectionDraft.findUnique({
            where: { sectionId_userId: { sectionId, userId: actor.id } },
            select: { contentJson: true, wordCount: true, updatedAt: true, baseRevisionId: true },
          })
        : null

      // A draft written on a revision that is no longer the head was
      // overtaken: somebody saved this section after it was started. The
      // editor must not open it over their text. Judged by the revision it
      // records, not by time: a draft saved after a "changed a moment ago"
      // refusal is newer than the head and still written on the old text
      // (2026-10-16 spec review). One that says nothing the head does not
      // is no draft at all.
      let draft = null
      if (saved) {
        const headId = section.currentRevision?.id ?? null
        const behind = saved.baseRevisionId !== headId
        const flavour = behind ? await flavourOf(ctx.db, storyboardId) : null
        const redundant =
          flavour !== null &&
          section.currentRevision !== null &&
          sameDoc(
            parseDoc(saved.contentJson, flavour),
            parseDoc(section.currentRevision.contentJson, flavour),
          )
        if (!redundant) {
          draft = {
            contentJson: saved.contentJson,
            wordCount: saved.wordCount,
            updatedAt: saved.updatedAt,
            behind,
          }
        }
      }

      return { section, draft, permissions }
    }),

  /** A whole chapter's prose, one payload per chapter (NFR-1). */
  listForChapter: publicProcedure
    .input(z.object({ chapterId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId } = await loadChapter(ctx.db, actor, input.chapterId)

      return ctx.db.section.findMany({
        where: { chapterId, deletedAt: null, mergedIntoId: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          wordCount: true,
          currentRevision: { select: { id: true, contentJson: true } },
        },
      })
    }),

  /** FR-2.3 — a new section, at the end of its chapter or after a given one. */
  create: activeProcedure
    .input(
      z.object({
        chapterId: z.string().min(1),
        afterSectionId: z.string().min(1).optional(),
        title: titleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId, storyboardId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )

      const flavour = await flavourOf(ctx.db, storyboardId)
      const doc = emptyDoc(flavour)
      const derived = derive(doc)
      const userId = ctx.session.user.id

      return ctx.db.$transaction(async (tx) => {
        const siblings = await tx.section.findMany({
          where: { chapterId, deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'asc' },
          select: { id: true },
        })

        const afterIndex = input.afterSectionId
          ? siblings.findIndex((section) => section.id === input.afterSectionId)
          : siblings.length - 1
        const position = afterIndex + 1

        // Make room, then insert. Rewriting siblings keeps `order` contiguous.
        for (const [index, sibling] of siblings.entries()) {
          if (index >= position) {
            await tx.section.update({ where: { id: sibling.id }, data: { order: index + 1 } })
          }
        }

        const section = await tx.section.create({
          data: {
            chapterId,
            lineageId: randomUUID(),
            order: position,
            title: input.title ?? null,
          },
          select: { id: true, order: true, title: true },
        })
        const revision = await tx.revision.create({
          data: {
            sectionId: section.id,
            contentJson: doc,
            contentText: derived.contentText,
            wordCount: derived.wordCount,
            contentHash: derived.contentHash,
            source: 'AUTHORED',
            authorId: userId,
          },
          select: { id: true },
        })
        await tx.section.update({
          where: { id: section.id },
          data: { currentRevisionId: revision.id },
        })

        return section
      })
    }),

  rename: activeProcedure
    .input(z.object({ sectionId: z.string().min(1), title: titleSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )
      return ctx.db.section.update({
        where: { id: sectionId },
        // Cleared is untitled ("Section 2"), not a title of nothing.
        data: { title: input.title === '' ? null : (input.title ?? null) },
        select: { id: true, title: true },
      })
    }),

  /**
   * FR-2.3 (phase 14, item 8.3) — a section to another chapter of the same
   * version, at a position counted from 0. Both chapters are renumbered in one
   * transaction; the section keeps its lineage, its history, its drafts and
   * its requests, which follow it to its new address. A chapter keeps at least
   * one section, as Remove already insists.
   */
  move: activeProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        toChapterId: z.string().min(1),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const {
        sectionId,
        chapterId: fromChapterId,
        versionId,
      } = await loadSection(ctx.db, actor, input.sectionId, 'storyboard:structure')
      const target = await loadChapter(ctx.db, actor, input.toChapterId, 'storyboard:structure')
      const chapter = await ctx.db.chapter.findUniqueOrThrow({
        where: { id: target.chapterId },
        select: { deletedAt: true },
      })
      if (target.versionId !== versionId || chapter.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A section moves to another chapter of the same draft.',
        })
      }

      const live = { deletedAt: null, mergedIntoId: null }
      const moved = await ctx.db.$transaction(async (tx) => {
        const from = await tx.section.findMany({
          where: { chapterId: fromChapterId, ...live },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        const sameChapter = fromChapterId === target.chapterId
        if (!sameChapter && from.length <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'A chapter keeps at least one section. Add another to it first, or remove the chapter.',
          })
        }
        const left = from.filter((section) => section.id !== sectionId)
        const into = sameChapter
          ? left
          : await tx.section.findMany({
              where: { chapterId: target.chapterId, ...live },
              orderBy: { order: 'asc' },
              select: { id: true },
            })
        const at = Math.min(input.position, into.length)
        const ordered = [...into.slice(0, at), { id: sectionId }, ...into.slice(at)]

        if (!sameChapter) {
          for (const [order, section] of left.entries()) {
            await tx.section.update({ where: { id: section.id }, data: { order } })
          }
        }
        for (const [order, section] of ordered.entries()) {
          await tx.section.update({
            where: { id: section.id },
            data: section.id === sectionId ? { order, chapterId: target.chapterId } : { order },
          })
        }
        return { chapterId: target.chapterId, position: at }
      })

      log.info(
        { event: 'section.moved', sectionId, from: fromChapterId, to: moved.chapterId },
        'section moved',
      )
      return moved
    }),

  /** FR-2.3 — one transaction rewrites every sibling's `order`. */
  reorder: activeProcedure
    .input(
      z.object({
        chapterId: z.string().min(1),
        sectionIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )

      const existing = await ctx.db.section.findMany({
        where: { chapterId, deletedAt: null, mergedIntoId: null },
        select: { id: true },
      })
      const existingIds = new Set(existing.map((section) => section.id))
      const incoming = new Set(input.sectionIds)
      if (
        incoming.size !== input.sectionIds.length ||
        incoming.size !== existingIds.size ||
        input.sectionIds.some((id) => !existingIds.has(id))
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That ordering does not match this chapter.',
        })
      }

      await ctx.db.$transaction(
        input.sectionIds.map((id, order) =>
          ctx.db.section.update({ where: { id }, data: { order } }),
        ),
      )
      return { ok: true }
    }),

  /** A tombstone (decision 0008). A chapter keeps at least one section. */
  /**
   * Phase 14, item 5.2 — what removing this section, or joining it into the
   * one above, would do: its words, the requests on it that would close, and
   * the people who would be told. Read with the right the change itself needs.
   */
  removalImpact: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: { wordCount: true },
      })
      return { words: section.wordCount, ...(await sectionsRequestImpact(ctx.db, [sectionId])) }
    }),

  /**
   * Phase 14, item 5.8 (decision 0008, FR-2.4, FR-8.2) — where a section is,
   * or was: its story and chapter, whether it was removed or joined away and
   * into what, and the sections joined into it. A removed or joined-away
   * section has no position among the live ones, so this is how its history
   * keeps an address. Read with the story's read right, as the history is.
   */
  whereabouts: publicProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, permissions } = await loadSection(ctx.db, actor, input.sectionId)
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: {
          title: true,
          deletedAt: true,
          updatedAt: true,
          mergedInto: { select: { id: true, title: true } },
          mergedFrom: {
            select: { id: true, title: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
          },
          chapter: {
            select: {
              title: true,
              deletedAt: true,
              version: {
                select: {
                  id: true,
                  isMain: true,
                  storyboard: { select: { slug: true, title: true } },
                },
              },
            },
          },
        },
      })
      return {
        title: section.title,
        removedAt: section.deletedAt,
        joinedInto: section.mergedInto
          ? { id: section.mergedInto.id, title: section.mergedInto.title, at: section.updatedAt }
          : null,
        joinedFrom: section.mergedFrom.map((entry) => ({
          id: entry.id,
          title: entry.title,
          at: entry.updatedAt,
        })),
        chapter: { title: section.chapter.title, removedAt: section.chapter.deletedAt },
        version: { id: section.chapter.version.id, isMain: section.chapter.version.isMain },
        storyboard: section.chapter.version.storyboard,
        canRestore: permissions.canRestore,
      }
    }),

  /**
   * Item 5.7 (decision 0008) — a removed section comes back at the end of
   * its chapter, lineage unchanged. Its chapter has to be in the story: a
   * section in a removed chapter comes back with the chapter. Requests
   * closed by the removal stay closed. Not from a deleted version, and not
   * after the grace.
   */
  restore: activeProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      // Loaded for reading, because the loader refuses a removed section for
      // anything else; the structure right is then checked by hand.
      const { sectionId, chapterId, resource } = await loadSection(ctx.db, actor, input.sectionId)
      assertCan(actor, 'storyboard:structure', resource)
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: {
          deletedAt: true,
          mergedIntoId: true,
          chapter: { select: { deletedAt: true, version: { select: { deletedAt: true } } } },
        },
      })
      // Joined away first: a join sets no `deletedAt`, and is not undone here.
      if (section.mergedIntoId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That section was joined into another; its words are there.',
        })
      }
      if (!section.deletedAt) return { ok: true, restored: false }
      if (section.chapter.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bring its chapter back first; the section comes with it.',
        })
      }
      if (section.chapter.version.deletedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That version was deleted.' })
      }
      if (section.deletedAt.getTime() < Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A removed section can be brought back for ${String(SOFT_DELETE_GRACE_DAYS)} days.`,
        })
      }

      await ctx.db.$transaction(async (tx) => {
        const last = await tx.section.findFirst({
          where: { chapterId, deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        await tx.section.update({
          where: { id: sectionId },
          data: { deletedAt: null, order: (last?.order ?? -1) + 1 },
        })
      })
      log.info({ event: 'section.restore', sectionId }, 'removed section brought back')
      return { ok: true, restored: true }
    }),

  /**
   * Item 5.3 — whose accepted words would leave the main draft if this
   * revision were restored: the credits `restoreRevision` would unlink,
   * named before it does, by the same rule (credited on a revision the
   * restored text does not stand on). Nothing in an alternate version, where
   * no credit moves.
   */
  restoreImpact: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1), revisionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, storyboardId, currentRevisionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'revision:restore',
      )
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: { lineageId: true, chapter: { select: { version: { select: { isMain: true } } } } },
      })
      // The same rule as `restoreRevision`: any version on the chain the
      // section's text stands on. This asked for one written in this row
      // only, so after a promotion a version from before the copy failed
      // here while the restore went through, and its dialog never named the
      // helpers it took credit from (2026-10-26 final pass).
      const history = currentRevisionId ? await ancestorIds(ctx.db, currentRevisionId) : []
      const source = history.includes(input.revisionId) ? { id: input.revisionId } : null
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'That version is not here.' })
      if (!section.chapter.version.isMain) return { told: [] as Person[] }

      const surviving = [...(await ancestorIds(ctx.db, source.id)), source.id]
      const affected = await ctx.db.credit.findMany({
        where: {
          storyboardId,
          sectionLineage: section.lineageId,
          isLive: true,
          revisionId: { not: null, notIn: surviving },
          contributorId: { not: null },
        },
        select: {
          contributor: { select: { id: true, username: true, displayName: true, status: true } },
        },
        distinct: ['contributorId'],
      })
      return {
        told: affected.flatMap((credit) => (credit.contributor ? [credit.contributor] : [])),
      }
    }),

  delete: activeProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, chapterId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )

      const live = await ctx.db.section.count({
        where: { chapterId, deletedAt: null, mergedIntoId: null },
      })
      if (live <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A chapter keeps at least one section.',
        })
      }

      await ctx.db.$transaction(async (tx) => {
        // One removal in a chapter at a time, and only of a live section: two
        // at once each counted the other as still there, and the chapter was
        // left with none (2026-10-26 final pass, the detective review).
        await tx.$executeRaw`select 1 from "Chapter" where id = ${chapterId} for update`
        const marked = await tx.section.updateMany({
          where: { id: sectionId, deletedAt: null },
          data: { deletedAt: new Date() },
        })
        if (marked.count !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That section was removed already.' })
        }
        const remaining = await tx.section.findMany({
          where: { chapterId, deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        if (remaining.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A chapter keeps at least one section.',
          })
        }
        for (const [order, section] of remaining.entries()) {
          await tx.section.update({ where: { id: section.id }, data: { order } })
        }
      })
      // Requests on a deleted section have nothing left to be about.
      await afterCommit('section.delete.close_requests', () =>
        closeRequestsOnSections(ctx.db, [sectionId]),
      )

      return { ok: true }
    }),

  /**
   * FR-2.4 — split at the cursor. The client sends the block index the caret
   * sits at; everything from there down moves into a new section with a *new*
   * lineage, because it is new material as far as credit and comparison are
   * concerned (architecture section 2.2).
   *
   * Both halves get a fresh revision. The original keeps its lineage and its
   * history, so "what did this section say last week" still answers.
   */
  split: activeProcedure
    .input(z.object({ sectionId: z.string().min(1), atBlockIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, chapterId, storyboardId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )

      const flavour = await flavourOf(ctx.db, storyboardId)
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: {
          order: true,
          title: true,
          currentRevisionId: true,
          currentRevision: { select: { contentJson: true } },
        },
      })

      const doc = parseDoc(section.currentRevision?.contentJson ?? emptyDoc(flavour), flavour)
      const blocks = doc.content
      if (input.atBlockIndex >= blocks.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'There is nothing after the cursor to split into a new section.',
        })
      }

      const head = { type: 'doc' as const, content: blocks.slice(0, input.atBlockIndex) }
      const tail = { type: 'doc' as const, content: blocks.slice(input.atBlockIndex) }
      const headDerived = derive(head as StoryboardDoc)
      const tailDerived = derive(tail as StoryboardDoc)
      const userId = ctx.session.user.id

      return ctx.db.$transaction(async (tx) => {
        // Push every later sibling down one to make room.
        const siblings = await tx.section.findMany({
          where: {
            chapterId,
            deletedAt: null,
            mergedIntoId: null,
            order: { gt: section.order },
          },
          select: { id: true, order: true },
        })
        for (const sibling of siblings) {
          await tx.section.update({
            where: { id: sibling.id },
            data: { order: sibling.order + 1 },
          })
        }

        const headRevision = await tx.revision.create({
          data: {
            sectionId,
            parentId: section.currentRevisionId,
            contentJson: head,
            contentText: headDerived.contentText,
            wordCount: headDerived.wordCount,
            contentHash: headDerived.contentHash,
            source: 'AUTHORED',
            authorId: userId,
          },
          select: { id: true },
        })
        await moveHead(
          tx,
          sectionId,
          section.currentRevisionId,
          headRevision.id,
          headDerived.wordCount,
        )

        const created = await tx.section.create({
          data: {
            chapterId,
            lineageId: randomUUID(),
            order: section.order + 1,
            wordCount: tailDerived.wordCount,
          },
          select: { id: true },
        })
        const tailRevision = await tx.revision.create({
          data: {
            sectionId: created.id,
            // No parent: this lineage starts here.
            contentJson: tail,
            contentText: tailDerived.contentText,
            wordCount: tailDerived.wordCount,
            contentHash: tailDerived.contentHash,
            source: 'AUTHORED',
            authorId: userId,
          },
          select: { id: true },
        })
        await tx.section.update({
          where: { id: created.id },
          data: { currentRevisionId: tailRevision.id },
        })

        return { sectionId, newSectionId: created.id }
      })
    }),

  /**
   * FR-2.4 — join this section into the one above it. The absorbed section is
   * marked `mergedIntoId` rather than deleted, so its revision history stays
   * addressable exactly as the requirement asks.
   *
   * Never called "merge" in the interface; see the vocabulary table (SRS 2).
   */
  joinWithPrevious: activeProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, chapterId, storyboardId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )

      const flavour = await flavourOf(ctx.db, storyboardId)
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: { order: true, currentRevision: { select: { contentJson: true } } },
      })

      const previous = await ctx.db.section.findFirst({
        where: {
          chapterId,
          deletedAt: null,
          mergedIntoId: null,
          order: { lt: section.order },
        },
        orderBy: { order: 'desc' },
        select: {
          id: true,
          currentRevisionId: true,
          currentRevision: { select: { contentJson: true } },
        },
      })
      if (!previous) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This is the first section in its chapter, so there is nothing above it.',
        })
      }

      const above = parseDoc(previous.currentRevision?.contentJson ?? emptyDoc(flavour), flavour)
      const below = parseDoc(section.currentRevision?.contentJson ?? emptyDoc(flavour), flavour)
      const joined = {
        type: 'doc' as const,
        content: [...above.content, ...below.content],
      } as StoryboardDoc
      const derived = derive(joined)
      const userId = ctx.session.user.id

      const result = await ctx.db.$transaction(async (tx) => {
        const revision = await tx.revision.create({
          data: {
            sectionId: previous.id,
            parentId: previous.currentRevisionId,
            contentJson: joined,
            contentText: derived.contentText,
            wordCount: derived.wordCount,
            contentHash: derived.contentHash,
            source: 'AUTHORED',
            authorId: userId,
          },
          select: { id: true },
        })
        await moveHead(tx, previous.id, previous.currentRevisionId, revision.id, derived.wordCount)
        // Only once: a second join of the same section, from a second click or
        // a second tab, finds it already joined (phase 12 audit).
        const absorbed = await tx.section.updateMany({
          where: { id: sectionId, mergedIntoId: null, deletedAt: null },
          data: { mergedIntoId: previous.id },
        })
        if (absorbed.count !== 1) throw changedUnderfoot()

        // The absorbed section leaves the reading order; close the gap.
        const remaining = await tx.section.findMany({
          where: { chapterId, deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        for (const [order, entry] of remaining.entries()) {
          await tx.section.update({ where: { id: entry.id }, data: { order } })
        }

        return { sectionId: previous.id }
      })
      // Requests on the absorbed section have nothing left to be about.
      await afterCommit('section.join.close_requests', () =>
        closeRequestsOnSections(ctx.db, [sectionId]),
      )
      return result
    }),

  /**
   * FR-4.4 autosave, and FR-4.5. Only read permission is required: opening the
   * editor on someone else's section creates a private draft in your own
   * account and never touches their content. `SectionDraft` is keyed by
   * (section, user), so that privacy is structural rather than a filter someone
   * can forget.
   */
  saveDraft: activeProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        contentJson: docInput,
        // The revision the editor's text is written on. Optional only for a
        // tab opened before this was asked for; without it the draft counts
        // as overtaken, which shows it beside the text rather than over it.
        baseRevisionId: z.string().min(1).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, storyboardId } = await loadSection(ctx.db, actor, input.sectionId)

      const flavour = await flavourOf(ctx.db, storyboardId)
      const doc = parseDoc(input.contentJson, flavour)
      const derived = derive(doc)
      const userId = ctx.session.user.id

      const baseRevisionId = input.baseRevisionId ?? null

      const draft = await ctx.db.sectionDraft.upsert({
        where: { sectionId_userId: { sectionId, userId } },
        create: {
          sectionId,
          userId,
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          baseRevisionId,
        },
        update: {
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          baseRevisionId,
        },
        select: { wordCount: true, updatedAt: true },
      })

      return draft
    }),

  discardDraft: activeProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId } = await loadSection(ctx.db, actor, input.sectionId)
      await ctx.db.sectionDraft.deleteMany({
        where: { sectionId, userId: ctx.session.user.id },
      })
      return { ok: true }
    }),

  /**
   * FR-4.4 — the durable revision, cut on blur, navigation or five minutes.
   * Requires edit permission: this is the main draft, not a private draft.
   *
   * `baseRevisionId` is what the editor was opened against. If the head has
   * moved since, the write is refused rather than silently overwriting a
   * co-author — the same conflict shape FR-6.6 uses for suggestions.
   */
  commitRevision: activeProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        contentJson: docInput,
        baseRevisionId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, storyboardId, currentRevisionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:edit',
      )

      if (currentRevisionId !== input.baseRevisionId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This section changed a moment ago. Reload to see the current text.',
        })
      }

      const flavour = await flavourOf(ctx.db, storyboardId)
      const doc = parseDoc(input.contentJson, flavour)
      const derived = derive(doc)
      const userId = ctx.session.user.id

      // Nothing changed: do not grow the chain with an identical revision.
      // The documents are compared, not their text. `contentHash` is of the
      // plain text, so an italic, a quote, a scene break or a heading added to
      // the same words used to count as nothing changed: the save was skipped
      // and the draft holding the formatting deleted, while the editor said
      // "Saved" (2026-10-16 spec review).
      const head = currentRevisionId
        ? await ctx.db.revision.findUnique({
            where: { id: currentRevisionId },
            select: { contentJson: true },
          })
        : null
      if (head && sameDoc(parseDoc(head.contentJson, flavour), doc)) {
        await ctx.db.sectionDraft.deleteMany({ where: { sectionId, userId } })
        return { revisionId: currentRevisionId, unchanged: true as const }
      }

      const revisionId = await ctx.db.$transaction(async (tx) => {
        const revision = await tx.revision.create({
          data: {
            sectionId,
            parentId: currentRevisionId,
            contentJson: doc,
            contentText: derived.contentText,
            wordCount: derived.wordCount,
            contentHash: derived.contentHash,
            source: 'AUTHORED',
            authorId: userId,
          },
          select: { id: true },
        })
        await moveHead(tx, sectionId, currentRevisionId, revision.id, derived.wordCount)
        // The draft has become the text; it has done its job.
        await tx.sectionDraft.deleteMany({ where: { sectionId, userId } })
        return revision.id
      })

      return { revisionId, unchanged: false as const }
    }),

  /**
   * FR-8.3 — the history panel. Immutable, permanently addressable revisions
   * with who wrote them, when, and where they came from.
   *
   * Decision 0007: a reader of a storyboard that used to be private sees only
   * the revisions written after it went public. The filter runs in the database.
   */
  history: publicProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        take: z.number().int().min(1).max(HISTORY.pageMax).default(HISTORY.pageDefault),
        /**
         * How many of the newest to skip: the next page of a long history
         * (FR-8.3). Only the newest fifty could be seen until the 2026-10-16
         * spec review.
         */
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { resource, currentRevisionId } = await loadSection(ctx.db, actor, input.sectionId)
      const skip = input.cursor ?? 0

      // The chain the current text stands on, not this row's revisions: an
      // alternate version's history begins in the main draft, and after a
      // promotion the main draft's history is mostly another row's (decision
      // 0014). Listed by row until the 2026-10-16 spec review, so a promoted
      // draft showed only the edits made since it was copied.
      const chain = currentRevisionId ? await ancestorIds(ctx.db, currentRevisionId) : []
      const where = { id: { in: chain }, ...revisionVisibilityWhere(actor, resource) }
      const visible = await ctx.db.revision.count({ where })
      const revisions = await ctx.db.revision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: input.take,
        select: {
          id: true,
          createdAt: true,
          wordCount: true,
          source: true,
          contentHash: true,
          parentId: true,
          restoredFromId: true,
          // FR-8.4 — "restored from 12 Sep": the date of the version copied.
          restoredFrom: { select: { createdAt: true } },
          // FR-8.6 (item 8.14) — and why, when the person restoring said.
          restoreReason: true,
          author: { select: { id: true, username: true, displayName: true } },
          acceptedBy: { select: { id: true, username: true, displayName: true } },
        },
      })

      return {
        revisions,
        currentRevisionId,
        /**
         * True when decision 0007 is hiding the start of the chain. It compared
         * the whole chain with one page of it, so any section past fifty
         * versions said it had been private for part of its life.
         */
        truncatedByVisibility: !isAuthor(actor, resource) && visible < chain.length,
        /** Where the next page starts, or null when this was the last. */
        nextCursor: visible > skip + revisions.length ? skip + revisions.length : null,
      }
    }),

  /**
   * FR-8.4 — restoring never rewinds the chain. It appends a new revision whose
   * content equals an old one and whose `restoredFromId` points at what it
   * copied, so the panel can label it "restored from 12 Sep".
   *
   * FR-8.5 — when a restore removes text that came from an accepted
   * suggestion, the contributor is told, and their `Credit` is marked not live
   * rather than deleted (principle 1.3.3: removing the writing does not remove
   * the record of the contribution).
   */
  restoreRevision: activeProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        revisionId: z.string().min(1),
        // FR-8.6 (item 8.14) — optional, and one of FR-6.10's chips: no free text.
        reason: passChipSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { sectionId, storyboardId, currentRevisionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'revision:restore',
      )

      // The revision must be in this section's history, the chain its text
      // stands on; an id from elsewhere would otherwise graft another
      // story's prose into this one. The chain, not this row: the history
      // offers every version on it (decision 0014).
      const history = currentRevisionId ? await ancestorIds(ctx.db, currentRevisionId) : []
      const source = history.includes(input.revisionId)
        ? await ctx.db.revision.findUnique({
            where: { id: input.revisionId },
            select: {
              id: true,
              contentJson: true,
              contentText: true,
              wordCount: true,
              contentHash: true,
            },
          })
        : null
      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
      }
      if (source.id === currentRevisionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That is already the current text.',
        })
      }

      const userId = ctx.session.user.id
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: { lineageId: true, chapter: { select: { version: { select: { isMain: true } } } } },
      })
      // FR-9.1 — a credit is live while its writing is in the main draft. A
      // restore in an alternate version changes nothing a reader sees, so it
      // changes no credit; until the 2026-10-16 spec review it took credits
      // out of the main draft's record all the same.
      const inMainDraft = section.chapter.version.isMain

      // FR-8.5 — which credits are live afterwards: those earned on a revision
      // the restored text stands on. Walking the parent chain of the revision
      // being restored to gives exactly that set.
      const ancestors = await ancestorIds(ctx.db, source.id)

      const { revisionId, unlinked } = await ctx.db.$transaction(async (tx) => {
        const revision = await tx.revision.create({
          data: {
            sectionId,
            parentId: currentRevisionId,
            contentJson: source.contentJson ?? {},
            contentText: source.contentText,
            wordCount: source.wordCount,
            contentHash: source.contentHash,
            source: 'RESTORED',
            restoredFromId: source.id,
            restoreReason: input.reason ?? null,
            authorId: userId,
          },
          select: { id: true },
        })
        await moveHead(tx, sectionId, currentRevisionId, revision.id, source.wordCount)

        if (!inMainDraft) return { revisionId: revision.id, unlinked: [] }

        // This story's credits on this section, by lineage: the revision a
        // credit was earned on may be in another row of it (a promoted
        // version's). Judged by row until the 2026-10-16 spec review.
        const onThisSection = { storyboardId, sectionLineage: section.lineageId }
        const surviving = [...ancestors, revision.id]

        // Credited on a revision the restored text does not stand on: that
        // writing is no longer in the main draft.
        const affected = await tx.credit.findMany({
          where: { ...onThisSection, isLive: true, revisionId: { not: null, notIn: surviving } },
          select: { id: true, contributorId: true, storyboardId: true },
        })
        if (affected.length > 0) {
          await tx.credit.updateMany({
            where: { id: { in: affected.map((credit) => credit.id) } },
            data: { isLive: false },
          })
        }
        // And the other way: restoring an accepted text back puts its writing
        // back in the draft, and its credit with it. Only ever turned off
        // before.
        await tx.credit.updateMany({
          where: { ...onThisSection, isLive: false, revisionId: { in: surviving } },
          data: { isLive: true },
        })

        return { revisionId: revision.id, unlinked: affected }
      })

      // After the transaction, never inside it.
      // Decision 0013 — an erased contributor has no account to notify, and
      // notifying them would be the opposite of what they asked for.
      const toNotify = unlinked.filter(
        (credit): credit is typeof credit & { contributorId: string } =>
          credit.contributorId !== null,
      )
      if (toNotify.length > 0) {
        await afterCommit('section.restore.notify', () =>
          ctx.db.notification.createMany({
            data: toNotify.map((credit) => ({
              userId: credit.contributorId,
              type: 'CONTRIBUTION_REMOVED' as const,
              payload: { sectionId, revisionId, creditId: credit.id },
            })),
          }),
        )
      }

      log.info(
        {
          event: 'section.restore',
          sectionId,
          restoredFrom: source.id,
          userId,
          creditsNoLongerLive: unlinked.length,
        },
        'revision restored',
      )
      // Item 10.2 (NFR-7) — stored as well as logged.
      await recordEvent(ctx.db, {
        event: 'section.restore',
        actorId: userId,
        subjectId: null,
        storyboardId,
        target: { type: 'SECTION', id: sectionId },
        detail: { restoredFrom: source.id, revisionId, creditsNoLongerLive: unlinked.length },
      })
      return { revisionId, creditsNoLongerLive: unlinked.length }
    }),
})

/**
 * Every revision from `revisionId` back to the start of the chain, newest
 * first: a section's history (decision 0014), whichever section rows the
 * revisions were written in. An alternate version starts on the main draft's
 * revision, and a promoted version's sections are rows of their own, so
 * "this row's revisions" is not the history; this chain is.
 *
 * One recursive query. It was a loop of one query per revision, used only by
 * restore; the history panel reads it on every open, and an edited section
 * cuts a revision at every pause. The depth cap guards against a cycle that
 * should be impossible, since revisions are append-only.
 */
async function ancestorIds(
  db: Prisma.TransactionClient,
  revisionId: string,
  cap: number = HISTORY.chainMax,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE chain (id, "parentId", depth) AS (
      SELECT id, "parentId", 1 FROM "Revision" WHERE id = ${revisionId}
      UNION ALL
      SELECT r.id, r."parentId", chain.depth + 1
      FROM "Revision" AS r
      JOIN chain ON r.id = chain."parentId"
      WHERE chain.depth < ${cap}
    )
    SELECT id FROM chain ORDER BY depth`
  return rows.map((row) => row.id)
}

const changedUnderfoot = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'This section changed a moment ago. Reload to see the current text.',
  })

/**
 * Moves a section's head from the revision the caller started from to a new
 * one, or throws if somebody moved it first.
 *
 * Every write that moves a head checked "is it still where I left it?" before
 * its transaction and then updated unconditionally, so an autosave landing
 * during a co-author's accept made the autosave the head and orphaned the
 * accepted text, still credited and announced as accepted (phase 12 audit).
 * The condition is in the update itself, so Postgres re-checks it against
 * whatever committed in between.
 */
async function moveHead(
  tx: Prisma.TransactionClient,
  sectionId: string,
  from: string | null,
  to: string,
  wordCount: number,
): Promise<void> {
  const moved = await tx.section.updateMany({
    where: { id: sectionId, currentRevisionId: from, deletedAt: null, mergedIntoId: null },
    data: { currentRevisionId: to, wordCount },
  })
  if (moved.count !== 1) throw changedUnderfoot()
}

/**
 * Two documents, both already through `parseDoc`, are the same text with the
 * same formatting. Parsing puts every node's keys in the schema's order, so
 * their JSON compares exactly.
 */
function sameDoc(a: StoryboardDoc, b: StoryboardDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
