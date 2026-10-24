import { randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@storyboard/db'

import {
  formatOf,
  IMPORT_LIMITS,
  TOO_LARGE,
  type Block,
  type Format,
  type Proposal,
} from '@storyboard/import/types'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { derive } from '@/lib/doc/text'
import {
  emptyDoc,
  flavourForStoryType,
  safeParseDoc,
  type DocFlavour,
  type StoryboardDoc,
} from '@/lib/doc/schema'
import { isOn, PAUSED } from '@/lib/flags'
import { publicId, slugify } from '@/lib/ids'
import { logger } from '@/lib/logger'
import { confirmedOutlineSchema } from '@/lib/schemas/import'
import { BULK_WRITE_TRANSACTION, DAILY_LIMITS } from '@/lib/schemas/constants'
import { DAY_MS, enforce, key, used, whenToRetry } from '@/server/limits'
import { createStoryboardSchema } from '@/lib/schemas/storyboard'
import { outlineProblem } from '@/server/import-outline'
import {
  createUploadTarget,
  deleteObject,
  getObject,
  objectSize,
  uploadKey,
} from '@/server/storage'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

const log = logger.child({ router: 'import' })

/**
 * The parsers bring mammoth and an XML parser with them. They load with the
 * first file somebody analyses, not with every cold start of the tRPC route,
 * which is what a top-level import cost (phase 10).
 */
const importer = () => import('@storyboard/import')

/**
 * Import (FR-3), in four steps that mirror architecture section 5.
 *
 * `createUpload` mints a key and somewhere to PUT it. `analyse` parses and
 * *proposes*. `getProposal` hands that back to the review screen. `commit`
 * writes the tree — and only `commit` writes anything, which is the whole of
 * FR-3.2: a heuristic that cannot be checked before it runs is a heuristic
 * nobody should trust with a manuscript.
 *
 * Prose never round-trips through the browser. The review screen sends back an
 * outline of block indices; the blocks themselves are re-read from the stored
 * file at commit time. Parsing is deterministic, so the second read is the same
 * as the first, and a writer who tampers with the outline can rearrange their
 * own manuscript but cannot put words in it that were not in the file.
 */
export const importRouter = createTRPCRouter({
  /** FR-3.1 — a place to put the file. */
  createUpload: activeProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(IMPORT_LIMITS.fileNameChars),
        byteSize: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Item 9.4 (D-18) — paused by an administrator: refused before anything
      // is counted or uploaded, so nothing is lost by trying.
      if (await isOn('pause-imports', ctx.db)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: PAUSED['pause-imports'] })
      }

      const format = formatOf(input.fileName)
      if (!format) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'That is not a format this can read. Try .docx, .md, .txt, .rtf, .fountain or .fdx.',
        })
      }
      if (input.byteSize > IMPORT_LIMITS.bytes) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: TOO_LARGE })
      }

      // A day's stories already started: an import would be refused at the
      // end, after the upload and the review, so say so now. Read, not spent;
      // `commit` spends it.
      if (
        (await used(ctx.db, key.storyboardsCreated(userId), DAY_MS)) >=
        DAILY_LIMITS.storyboardsCreated
      ) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have started ${String(DAILY_LIMITS.storyboardsCreated)} stories today, which is the most for a day, and an import is a story. Try again tomorrow.`,
        })
      }

      // FR-13.3 — twice the daily ceiling for creating a storyboard by hand,
      // since that is what a committed import becomes and an abandoned one is
      // cheap. Counted before the key is minted, so a refusal writes nothing.
      await enforce(
        ctx.db,
        key.importsStarted(userId),
        { limit: DAILY_LIMITS.storyboardsCreated * 2, windowMs: DAY_MS },
        (retryAt) => `You have started a lot of imports today. Try again ${whenToRetry(retryAt)}.`,
      )

      const fileKey = uploadKey(userId, input.fileName)
      const target = await createUploadTarget(fileKey, 'application/octet-stream')

      const job = await ctx.db.importJob.create({
        data: { userId, fileKey, fileName: input.fileName, format, state: 'UPLOADED' },
        select: { id: true },
      })

      log.info({ event: 'import.created', jobId: job.id, userId, format }, 'import started')
      return { jobId: job.id, upload: target }
    }),

  /**
   * Stage one (FR-3.2): parse, propose, write nothing to the manuscript tree.
   *
   * A failure here is recorded on the job rather than thrown away, so the
   * review screen can say what went wrong with *this file* instead of showing
   * an empty outline and leaving the writer to guess.
   */
  analyse: activeProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const job = await load(ctx.db, ctx.session.user.id, input.jobId)
      const { analyse, SuspiciousArchiveError } = await importer()

      if (job.state === 'COMMITTED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That import is already done.' })
      }

      // Asked of the store before anything is read: the upload URL cannot bind
      // the size, so R2 holds whatever arrived (phase 12 audit).
      const size = await objectSize(job.fileKey)
      if (size === null) {
        await fail(ctx.db, job.id, 'That file never finished uploading. Try choosing it again.')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That file never finished uploading. Try choosing it again.',
        })
      }
      if (size > IMPORT_LIMITS.bytes) {
        await fail(ctx.db, job.id, TOO_LARGE)
        await deleteObject(job.fileKey)
        throw new TRPCError({ code: 'BAD_REQUEST', message: TOO_LARGE })
      }

      let file: Buffer
      try {
        file = await getObject(job.fileKey)
      } catch {
        await fail(ctx.db, job.id, 'That file never finished uploading. Try choosing it again.')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That file never finished uploading. Try choosing it again.',
        })
      }

      if (file.byteLength > IMPORT_LIMITS.bytes) {
        await fail(ctx.db, job.id, TOO_LARGE)
        throw new TRPCError({ code: 'BAD_REQUEST', message: TOO_LARGE })
      }

      let proposal: Proposal
      try {
        proposal = await analyse(job.format as Format, file)
      } catch (error) {
        log.warn({ event: 'import.parse_failed', jobId: job.id, error }, 'could not read the file')
        // The archive guard has something specific to say; everything else gets
        // the honest general answer rather than a stack trace's worth of detail.
        const message =
          error instanceof SuspiciousArchiveError
            ? error.message
            : 'That file could not be read. It may be damaged, or not the format it claims.'
        await fail(ctx.db, job.id, message)
        throw new TRPCError({ code: 'BAD_REQUEST', message })
      }

      if (proposal.tooLong) {
        await fail(ctx.db, job.id, 'That manuscript is longer than 300,000 words.')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `That manuscript is ${proposal.wordCount.toLocaleString('en-GB')} words. The limit is ${IMPORT_LIMITS.words.toLocaleString('en-GB')}.`,
        })
      }

      await ctx.db.importJob.update({
        where: { id: job.id },
        data: { state: 'ANALYSED', detectedBy: proposal.strategy, proposal, error: null },
      })

      log.info(
        {
          event: 'import.analysed',
          jobId: job.id,
          strategy: proposal.strategy,
          chapters: proposal.chapters.length,
          words: proposal.wordCount,
        },
        'proposal ready for review',
      )
      return proposal
    }),

  /** What the review screen renders. Nothing has been written at this point. */
  getProposal: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const job = await load(ctx.db, ctx.session.user.id, input.jobId)
      return {
        id: job.id,
        fileName: job.fileName,
        format: job.format,
        state: job.state,
        error: job.error,
        storyboardId: job.storyboardId,
        proposal: job.proposal as Proposal | null,
      }
    }),

  /**
   * Stage two (FR-3.2): the writer has confirmed, and now the tree is written.
   *
   * One transaction. A manuscript half-imported would be worse than one not
   * imported at all, and the writer would have no way to tell which half.
   */
  commit: activeProcedure
    .input(
      createStoryboardSchema.extend({
        jobId: z.string().min(1),
        outline: confirmedOutlineSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const job = await load(ctx.db, userId, input.jobId)

      if (job.state === 'COMMITTED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That import is already done.' })
      }
      // Only a file that was read and passed its limits. `commit` used to take
      // a job straight from upload, or one that had failed for being too long
      // (phase 12 audit).
      if (job.state !== 'ANALYSED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That file has not been read yet. Choose it again to start over.',
        })
      }

      const genres = await ctx.db.genre.findMany({
        where: { id: { in: input.genreIds } },
        select: { id: true },
      })
      if (genres.length !== input.genreIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' })
      }

      // The prose, read again from the file rather than taken from the request,
      // and so held to FR-3.1's limits again: the upload URL is still good for
      // a while after `analyse`, and another file can be put under the same key
      // (phase 12 audit).
      const tooLarge = () => new TRPCError({ code: 'BAD_REQUEST', message: TOO_LARGE })
      const size = await objectSize(job.fileKey)
      if (size === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That file is no longer here. Choose it again to start over.',
        })
      }
      if (size > IMPORT_LIMITS.bytes) throw tooLarge()
      const file = await getObject(job.fileKey)
      if (file.byteLength > IMPORT_LIMITS.bytes) throw tooLarge()

      const { extract, countWords } = await importer()
      const doc = await extract(job.format as Format, file)
      const blocks = doc.blocks
      const words = blocks.reduce((total, block) => total + countWords(block.text), 0)
      if (words > IMPORT_LIMITS.words) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `That manuscript is longer than ${IMPORT_LIMITS.words.toLocaleString('en-GB')} words.`,
        })
      }
      const problem = outlineProblem(input.outline, blocks.length)
      if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem })

      // FR-13.3 — five stories a day, and an import makes one. It counted only
      // against its own, larger allowance until the 2026-10-16 spec review,
      // so five stories by hand and ten imported made fifteen. Spent here,
      // where the story is made, not when the file was chosen.
      await enforce(
        ctx.db,
        key.storyboardsCreated(userId),
        { limit: DAILY_LIMITS.storyboardsCreated, windowMs: DAY_MS },
        (retryAt) =>
          `You can start ${String(DAILY_LIMITS.storyboardsCreated)} stories a day, and an import is one. Your file is kept for a day; try again ${whenToRetry(retryAt)}.`,
      )

      const flavour = flavourForStoryType(input.type)
      const id = publicId()
      const now = new Date()

      const created = await ctx.db.$transaction(async (tx) => {
        // Claimed first: a second commit of the same job waits here on the
        // row, then finds it taken. Both used to pass the check above and
        // create two storyboards (phase 12 audit).
        const claimed = await tx.importJob.updateMany({
          where: { id: job.id, state: 'ANALYSED' },
          data: { state: 'COMMITTED' },
        })
        if (claimed.count !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That import is already done.' })
        }

        const storyboard = await tx.storyboard.create({
          data: {
            publicId: id,
            slug: `${slugify(input.title)}-${id}`,
            title: input.title,
            type: input.type,
            visibility: input.visibility,
            ownerId: userId,
            publicFrom: input.visibility === 'PUBLIC' ? now : null,
            genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
          },
          select: { id: true, slug: true },
        })

        const version = await tx.version.create({
          data: {
            storyboardId: storyboard.id,
            name: 'Main draft',
            isMain: true,
            createdById: userId,
          },
          select: { id: true },
        })

        for (const [chapterIndex, chapter] of input.outline.entries()) {
          const chapterRow = await tx.chapter.create({
            data: {
              versionId: version.id,
              lineageId: randomUUID(),
              order: chapterIndex,
              title: chapter.title,
            },
            select: { id: true },
          })

          for (const [sectionIndex, section] of chapter.sections.entries()) {
            const content = docFromBlocks(blocks, section.from, section.to, flavour)
            const derived = derive(content)

            const sectionRow = await tx.section.create({
              data: {
                chapterId: chapterRow.id,
                lineageId: randomUUID(),
                order: sectionIndex,
                title: section.title ?? null,
                wordCount: derived.wordCount,
              },
              select: { id: true },
            })

            const revision = await tx.revision.create({
              data: {
                sectionId: sectionRow.id,
                contentJson: content,
                contentText: derived.contentText,
                wordCount: derived.wordCount,
                contentHash: derived.contentHash,
                // The one place this enum is used: an imported revision was
                // never written here, and FR-8.3's history should say so.
                source: 'IMPORTED',
                authorId: userId,
              },
              select: { id: true },
            })

            await tx.section.update({
              where: { id: sectionRow.id },
              data: { currentRevisionId: revision.id },
            })
          }
        }

        await tx.importJob.update({
          where: { id: job.id },
          data: { state: 'COMMITTED', storyboardId: storyboard.id },
        })

        return storyboard
        // A 300,000-word manuscript is thousands of rows written one after
        // another; Prisma's default five seconds undid it every time.
      }, BULK_WRITE_TRANSACTION)

      // The file has done its work. Keeping somebody's whole manuscript in
      // object storage afterwards is a copy nobody asked us to hold.
      await deleteObject(job.fileKey)

      log.info(
        {
          event: 'import.committed',
          jobId: job.id,
          storyboardId: created.id,
          chapters: input.outline.length,
          userId,
        },
        'manuscript imported',
      )
      return created
    }),
})

type Db = PrismaClient | Prisma.TransactionClient

async function load(db: Db, userId: string, jobId: string) {
  const job = await db.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      fileKey: true,
      fileName: true,
      format: true,
      state: true,
      error: true,
      proposal: true,
      storyboardId: true,
    },
  })

  // Somebody else's import is not theirs to see, and saying "forbidden" would
  // confirm that it exists.
  if (job?.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That import does not exist.' })
  }
  return job
}

/** Records why an import stopped, so the screen can say it in the writer's terms. */
async function fail(db: Db, jobId: string, message: string): Promise<void> {
  await db.importJob.update({ where: { id: jobId }, data: { state: 'FAILED', error: message } })
}

/**
 * The blocks of one section, as a document the schema will accept.
 *
 * Screenplay blocks and prose blocks are both in the block list; which are
 * storable depends on the story type (FR-4.2), so anything that does not belong
 * in this flavour becomes a paragraph rather than being dropped. A writer
 * importing a novel that happens to contain a scene heading should still find
 * those words in their manuscript.
 */
function docFromBlocks(
  blocks: Block[],
  from: number,
  to: number,
  flavour: DocFlavour,
): StoryboardDoc {
  const SCREENPLAY = new Set([
    'scene_heading',
    'action',
    'character',
    'parenthetical',
    'dialogue',
    'transition',
  ])

  const content: unknown[] = []
  for (let index = from; index <= to && index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) continue

    const node = block.json
    const isScreenplayNode = SCREENPLAY.has(node.type)

    if (flavour === 'screenplay') {
      // Headings and blockquotes have no meaning in a script.
      if (node.type === 'heading' || node.type === 'blockquote') {
        content.push({ type: 'action', ...(node.content ? { content: node.content } : {}) })
        continue
      }
      content.push(node)
      continue
    }

    if (isScreenplayNode) {
      content.push({ type: 'paragraph', ...(node.content ? { content: node.content } : {}) })
      continue
    }
    content.push(node)
  }

  // FR-3.7 — "footnote text, at the end of its section": the notes referred
  // to in this section's blocks, after its last one (extract/docx.ts).
  for (let index = from; index <= to && index < blocks.length; index += 1) {
    for (const note of blocks[index]?.footnotes ?? []) {
      content.push({ type: 'paragraph', content: [{ type: 'text', text: note }] })
    }
  }

  // A section with nothing in it is not storable; an empty paragraph is.
  if (content.length === 0) return emptyDoc(flavour)

  // FR-4.1 — the server decides what is storable, and an extractor is not
  // exempt from that. A node the schema refuses is dropped here rather than at
  // the database, where it would take the whole import down with it.
  const whole = safeParseDoc({ type: 'doc', content }, flavour)
  if (whole.success) return whole.data

  const kept = content.filter(
    (node) => safeParseDoc({ type: 'doc', content: [node] }, flavour).success,
  )
  const partial = safeParseDoc({ type: 'doc', content: kept }, flavour)
  return partial.success ? partial.data : emptyDoc(flavour)
}
