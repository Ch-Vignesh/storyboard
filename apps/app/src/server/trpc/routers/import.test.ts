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
})
