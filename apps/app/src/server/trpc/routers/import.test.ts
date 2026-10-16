/**
 * FR-3.2's second stage, `import.commit`, held to FR-3.1's limits however it
 * is called (phase 12 audit). It used to accept a job nobody had analysed, an
 * outline whose every section claimed the whole file, and two commits of one
 * job at once, which made two storyboards.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 * Uploads go to the local store: the test config blanks R2.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

const MANUSCRIPT = [
  'Chapter One',
  '',
  'The harbour had been empty for a year before she noticed the difference in it.',
  '',
  'Chapter Two',
  '',
  'Nobody came back for the boats, and nobody asked why.',
].join('\n')

describe.skipIf(!databaseUrl)('committing an import (FR-3.2, phase 12 audit)', () => {
  let db: PrismaClient
  let userId = ''
  let genreId = ''
  let call: Awaited<ReturnType<typeof callerFor>>

  async function callerFor(id: string, username: string) {
    const { createCallerFactory } = await import('../init')
    const { importRouter } = await import('./import')
    return createCallerFactory(importRouter)({
      db,
      session: { user: { id, username, onboarded: true }, expires: '' },
      account: { status: 'ACTIVE', isAdmin: false, deletionRequestedAt: null, username },
      headers: new Headers(),
    })
  }

  /** An uploaded, unread `.txt`, as `createUpload` and the browser leave it. */
  async function anUpload() {
    const { putObject } = await import('@/server/storage')
    const { jobId, upload } = await call.createUpload({
      fileName: 'harbour.txt',
      byteSize: Buffer.byteLength(MANUSCRIPT),
    })
    await putObject(upload.key, Buffer.from(MANUSCRIPT, 'utf8'))
    return jobId
  }

  const settings = () => ({
    title: 'The Harbour',
    type: 'NOVEL' as const,
    visibility: 'PRIVATE' as const,
    genreIds: [genreId],
  })

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `imp-${run}`
    const user = await db.user.create({
      data: { email: `import-${run}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    userId = user.id
    genreId = (await db.genre.findFirstOrThrow({ select: { id: true } })).id
    call = await callerFor(userId, username)
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboard: { ownerId: userId } } } }
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboard: { ownerId: userId } } } })
      await tx.version.deleteMany({ where: { storyboard: { ownerId: userId } } })
      await tx.storyboardGenre.deleteMany({ where: { storyboard: { ownerId: userId } } })
      await tx.importJob.deleteMany({ where: { userId } })
      await tx.storyboard.deleteMany({ where: { ownerId: userId } })
      await tx.rateLimitHit.deleteMany({ where: { key: { endsWith: userId } } })
      await tx.user.deleteMany({ where: { id: userId } })
    })
    await db.$disconnect()
  })

  it('refuses a job nobody has read', async () => {
    const jobId = await anUpload()
    await expect(
      call.commit({
        ...settings(),
        jobId,
        outline: [{ title: 'All', sections: [{ from: 0, to: 0 }] }],
      }),
    ).rejects.toThrow(/not been read yet/u)
  })

  it('refuses an outline whose sections all claim the same text', async () => {
    const jobId = await anUpload()
    await call.analyse({ jobId })
    const greedy = Array.from({ length: 50 }, () => ({ from: 0, to: 0 }))
    await expect(
      call.commit({ ...settings(), jobId, outline: [{ title: 'All', sections: greedy }] }),
    ).rejects.toThrow(/same part of the file/u)
  })

  it('makes one storyboard of one job, however many times it is committed at once', async () => {
    const jobId = await anUpload()
    const proposal = await call.analyse({ jobId })
    const outline = proposal.chapters.map((chapter) => ({
      title: chapter.title,
      sections: chapter.sections.map((section) => ({ from: section.from, to: section.to })),
    }))
    const before = await db.storyboard.count({ where: { ownerId: userId } })

    const results = await Promise.allSettled([
      call.commit({ ...settings(), jobId, outline }),
      call.commit({ ...settings(), jobId, outline }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.storyboard.count({ where: { ownerId: userId } })).toBe(before + 1)
  })

  /**
   * FR-3.7 — "footnote text, at the end of its section". Notes landed at the
   * end of the whole manuscript until the 2026-10-16 spec review.
   */
  it('puts a footnote at the end of the section that refers to it', async () => {
    const { Document, FootnoteReferenceRun, HeadingLevel, Packer, Paragraph, TextRun } =
      await import('docx')
    const file = await Packer.toBuffer(
      new Document({
        footnotes: { 1: { children: [new Paragraph('A note about the harbour.')] } },
        sections: [
          {
            children: [
              new Paragraph({ text: 'Chapter one', heading: HeadingLevel.HEADING_1 }),
              new Paragraph({
                children: [new TextRun('The harbour was empty.'), new FootnoteReferenceRun(1)],
              }),
              new Paragraph('A second paragraph in the first chapter.'),
              new Paragraph({ text: 'Chapter two', heading: HeadingLevel.HEADING_1 }),
              new Paragraph('The second chapter begins here.'),
            ],
          },
        ],
      }),
    )
    const { putObject } = await import('@/server/storage')
    const { jobId, upload } = await call.createUpload({
      fileName: 'notes.docx',
      byteSize: file.byteLength,
    })
    await putObject(upload.key, file)
    const proposal = await call.analyse({ jobId })
    const outline = proposal.chapters.map((chapter) => ({
      title: chapter.title,
      sections: chapter.sections.map((section) => ({ from: section.from, to: section.to })),
    }))

    const { slug } = await call.commit({ ...settings(), jobId, outline })

    const sections = await db.section.findMany({
      where: { chapter: { version: { storyboard: { slug } } } },
      orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }],
      select: { currentRevision: { select: { contentText: true } } },
    })
    expect(sections[0]?.currentRevision?.contentText).toMatch(/A note about the harbour\.$/u)
    expect(sections.at(-1)?.currentRevision?.contentText).not.toContain('A note')
  })

  /**
   * FR-13.3 — five stories a day, and an import is a story. Imports counted
   * only against their own allowance until the 2026-10-16 spec review.
   * Last: it fills the day.
   */
  it('counts an import against the day’s five stories', async () => {
    const { key } = await import('@/server/limits')
    const { DAILY_LIMITS } = await import('@/lib/schemas/constants')
    const jobId = await anUpload()
    const proposal = await call.analyse({ jobId })
    const outline = proposal.chapters.map((chapter) => ({
      title: chapter.title,
      sections: chapter.sections.map((section) => ({ from: section.from, to: section.to })),
    }))

    const spent = await db.rateLimitHit.count({ where: { key: key.storyboardsCreated(userId) } })
    await db.rateLimitHit.createMany({
      data: Array.from({ length: DAILY_LIMITS.storyboardsCreated - spent }, () => ({
        key: key.storyboardsCreated(userId),
      })),
    })

    await expect(call.commit({ ...settings(), jobId, outline })).rejects.toThrow(
      /an import is one/u,
    )
    await expect(
      call.createUpload({ fileName: 'harbour.txt', byteSize: Buffer.byteLength(MANUSCRIPT) }),
    ).rejects.toThrow(/an import is a story/u)
  })
})
