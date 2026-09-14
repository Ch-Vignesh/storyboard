import { randomUUID } from 'node:crypto'

import type { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadChapter, loadSection } from '@/lib/authz/guard'
import { isAuthor, revisionVisibilityWhere } from '@/lib/authz'
import {
  emptyDoc,
  flavourForStoryType,
  parseDoc,
  type DocFlavour,
  type StoryboardDoc,
} from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { logger } from '@/lib/logger'

import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

const log = logger.child({ router: 'section' })

const titleSchema = z.string().trim().max(200, 'That name is too long.').nullish()

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
      const actor = actorFrom(ctx.session)
      const { sectionId, permissions } = await loadSection(ctx.db, actor, input.sectionId)

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

      const draft = actor
        ? await ctx.db.sectionDraft.findUnique({
            where: { sectionId_userId: { sectionId, userId: actor.id } },
            select: { contentJson: true, wordCount: true, updatedAt: true },
          })
        : null

      return { section, draft, permissions }
    }),

  /** A whole chapter's prose, one payload per chapter (NFR-1). */
  listForChapter: publicProcedure
    .input(z.object({ chapterId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
  create: protectedProcedure
    .input(
      z.object({
        chapterId: z.string().min(1),
        afterSectionId: z.string().min(1).optional(),
        title: titleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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

  rename: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1), title: titleSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { sectionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'storyboard:structure',
      )
      return ctx.db.section.update({
        where: { id: sectionId },
        data: { title: input.title ?? null },
        select: { id: true, title: true },
      })
    }),

  /** FR-2.3 — one transaction rewrites every sibling's `order`. */
  reorder: protectedProcedure
    .input(
      z.object({
        chapterId: z.string().min(1),
        sectionIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
  delete: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
        await tx.section.update({ where: { id: sectionId }, data: { deletedAt: new Date() } })
        const remaining = await tx.section.findMany({
          where: { chapterId, deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        for (const [order, section] of remaining.entries()) {
          await tx.section.update({ where: { id: section.id }, data: { order } })
        }
      })

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
  split: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1), atBlockIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
        await tx.section.update({
          where: { id: sectionId },
          data: { currentRevisionId: headRevision.id, wordCount: headDerived.wordCount },
        })

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
  joinWithPrevious: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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

      return ctx.db.$transaction(async (tx) => {
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
        await tx.section.update({
          where: { id: previous.id },
          data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
        })
        await tx.section.update({
          where: { id: sectionId },
          data: { mergedIntoId: previous.id },
        })

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
    }),

  /**
   * FR-4.4 autosave, and FR-4.5. Only read permission is required: opening the
   * editor on someone else's section creates a private draft in your own
   * account and never touches their content. `SectionDraft` is keyed by
   * (section, user), so that privacy is structural rather than a filter someone
   * can forget.
   */
  saveDraft: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1), contentJson: docInput }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { sectionId, storyboardId } = await loadSection(ctx.db, actor, input.sectionId)

      const flavour = await flavourOf(ctx.db, storyboardId)
      const doc = parseDoc(input.contentJson, flavour)
      const derived = derive(doc)
      const userId = ctx.session.user.id

      const draft = await ctx.db.sectionDraft.upsert({
        where: { sectionId_userId: { sectionId, userId } },
        create: {
          sectionId,
          userId,
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
        },
        update: {
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
        },
        select: { wordCount: true, updatedAt: true },
      })

      return draft
    }),

  discardDraft: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
  commitRevision: protectedProcedure
    .input(
      z.object({
        sectionId: z.string().min(1),
        contentJson: docInput,
        baseRevisionId: z.string().min(1).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
      const head = currentRevisionId
        ? await ctx.db.revision.findUnique({
            where: { id: currentRevisionId },
            select: { contentHash: true },
          })
        : null
      if (head?.contentHash === derived.contentHash) {
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
        await tx.section.update({
          where: { id: sectionId },
          data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
        })
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
        take: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { sectionId, resource, currentRevisionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
      )

      const visibility = revisionVisibilityWhere(actor, resource)
      const revisions = await ctx.db.revision.findMany({
        where: { sectionId, ...visibility },
        orderBy: { createdAt: 'desc' },
        take: input.take,
        select: {
          id: true,
          createdAt: true,
          wordCount: true,
          source: true,
          contentHash: true,
          parentId: true,
          restoredFromId: true,
          author: { select: { id: true, username: true, displayName: true } },
          acceptedBy: { select: { id: true, username: true, displayName: true } },
        },
      })

      const total = await ctx.db.revision.count({ where: { sectionId } })

      return {
        revisions,
        currentRevisionId,
        /** True when decision 0007 is hiding the start of the chain. */
        truncatedByVisibility: !isAuthor(actor, resource) && total > revisions.length,
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
  restoreRevision: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1), revisionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { sectionId, currentRevisionId } = await loadSection(
        ctx.db,
        actor,
        input.sectionId,
        'revision:restore',
      )

      // The revision must belong to this section; an id from elsewhere would
      // otherwise graft another storyboard's prose into this one.
      const source = await ctx.db.revision.findFirst({
        where: { id: input.revisionId, sectionId },
        select: {
          id: true,
          contentJson: true,
          contentText: true,
          wordCount: true,
          contentHash: true,
        },
      })
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

      // FR-8.5 — which credits stop being live. A credit is live while the
      // revision it was earned on is an ancestor of the head; restoring past it
      // takes that writing out of the draft. Walking the parent chain of the
      // revision being restored to gives exactly the set that survives.
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
            authorId: userId,
          },
          select: { id: true },
        })
        await tx.section.update({
          where: { id: sectionId },
          data: { currentRevisionId: revision.id, wordCount: source.wordCount },
        })

        // Anything credited on a revision of this section that is *not* an
        // ancestor of what we just restored is no longer in the main draft.
        const affected = await tx.credit.findMany({
          where: {
            isLive: true,
            revisionId: { notIn: [...ancestors, revision.id] },
            revision: { sectionId },
          },
          select: { id: true, contributorId: true, storyboardId: true },
        })
        if (affected.length > 0) {
          await tx.credit.updateMany({
            where: { id: { in: affected.map((credit) => credit.id) } },
            data: { isLive: false },
          })
        }

        return { revisionId: revision.id, unlinked: affected }
      })

      // After the transaction, never inside it.
      if (unlinked.length > 0) {
        await ctx.db.notification.createMany({
          data: unlinked.map((credit) => ({
            userId: credit.contributorId,
            type: 'CONTRIBUTION_REMOVED' as const,
            payload: { sectionId, revisionId, creditId: credit.id },
          })),
        })
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
      return { revisionId, creditsNoLongerLive: unlinked.length }
    }),
})

/**
 * Every revision from `revisionId` back to the start of the chain.
 *
 * Walked one row at a time rather than with a recursive CTE: a section's chain
 * is tens of revisions, not thousands, and a plain loop is the version anyone
 * can check. The cap is a guard against a cycle that should be impossible —
 * revisions are append-only — rather than an expected case.
 */
async function ancestorIds(
  db: Prisma.TransactionClient,
  revisionId: string,
  cap = 5000,
): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | null = revisionId
  const seen = new Set<string>()

  while (cursor && ids.length < cap) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    ids.push(cursor)
    const row: { parentId: string | null } | null = await db.revision.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    })
    cursor = row?.parentId ?? null
  }

  return ids
}
