/**
 * Imports nobody finished (FR-3.1).
 *
 * The failure this guards against is silent by nature: an upload that nobody
 * deletes looks exactly like an upload that was deleted, until somebody lists
 * the bucket and finds strangers' manuscripts from months ago. So every case
 * below checks the file on disk as well as the row.
 *
 * Runs against the local storage driver (vitest.config.ts blanks R2), which is
 * the same interface the bucket sits behind. Needs a real Postgres, so it skips
 * when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { IMPORT_JOB_RETENTION_HOURS } from '@/lib/schemas/constants'
import * as storage from '@/server/storage'

import { purgeAbandonedImports } from './imports'

// The real driver, with one way to make it refuse: a key on this list.
const refused = new Set<string>()
vi.mock('@/server/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof storage>()
  return {
    ...actual,
    deleteObject: vi.fn(async (key: string) =>
      refused.has(key) ? false : actual.deleteObject(key),
    ),
  }
})

const databaseUrl = process.env.DATABASE_URL
const HOUR = 60 * 60 * 1000

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

describe.skipIf(!databaseUrl)('removing imports nobody finished (FR-3.1)', () => {
  let db: PrismaClient
  const made: string[] = []

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterEach(async () => {
    refused.clear()
    for (const userId of made) {
      const jobs = await db.importJob.findMany({ where: { userId }, select: { fileKey: true } })
      for (const job of jobs) await storage.deleteObject(job.fileKey)
    }
    // Import jobs go with their user (onDelete: Cascade).
    await db.user.deleteMany({ where: { id: { in: made } } })
    made.length = 0
  })

  async function aWriter(): Promise<string> {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const user = await db.user.create({
      data: {
        email: `imp-${run}@example.test`,
        username: `imp_${run}`,
        displayName: 'An Importer',
        passwordHash: 'argon2-placeholder',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    })
    made.push(user.id)
    return user.id
  }

  /** An import last touched `hoursAgo` hours ago, with its file on disk unless told otherwise. */
  async function anImport(
    userId: string,
    hoursAgo: number,
    {
      state = 'UPLOADED',
      withFile = true,
    }: { state?: 'UPLOADED' | 'COMMITTED'; withFile?: boolean } = {},
  ) {
    const fileKey = storage.uploadKey(userId, 'my-novel.docx')
    if (withFile) await storage.putObject(fileKey, Buffer.from('Chapter one. It was a dark night.'))
    const job = await db.importJob.create({
      data: { userId, fileKey, fileName: 'my-novel.docx', format: 'docx', state },
      select: { id: true },
    })
    // Prisma keeps updatedAt itself, so the age is set underneath it.
    await db.$executeRaw`update "ImportJob" set "updatedAt" = ${new Date(Date.now() - hoursAgo * HOUR)} where id = ${job.id}`
    return { id: job.id, path: storage.joinPath(storage.LOCAL_UPLOAD_ROOT, fileKey), fileKey }
  }

  async function rowExists(id: string): Promise<boolean> {
    return (await db.importJob.count({ where: { id } })) === 1
  }

  it('deletes the upload and the row of an import left for longer than the retention', async () => {
    const userId = await aWriter()
    const old = await anImport(userId, IMPORT_JOB_RETENTION_HOURS + 1)
    expect(await exists(old.path)).toBe(true)

    await purgeAbandonedImports(db)

    expect(await exists(old.path)).toBe(false)
    expect(await rowExists(old.id)).toBe(false)
  })

  it('leaves an import that is still within its day alone', async () => {
    const userId = await aWriter()
    const fresh = await anImport(userId, IMPORT_JOB_RETENTION_HOURS - 1)

    await purgeAbandonedImports(db)

    expect(await exists(fresh.path)).toBe(true)
    expect(await rowExists(fresh.id)).toBe(true)
  })

  it('removes a committed import’s row, whose file went when it committed', async () => {
    const userId = await aWriter()
    const committed = await anImport(userId, IMPORT_JOB_RETENTION_HOURS + 1, {
      state: 'COMMITTED',
      withFile: false,
    })

    await purgeAbandonedImports(db)

    expect(await rowExists(committed.id)).toBe(false)
  })

  it('keeps the row when the store refuses, so tomorrow’s run can find the file', async () => {
    const userId = await aWriter()
    const stuck = await anImport(userId, IMPORT_JOB_RETENTION_HOURS + 1)
    refused.add(stuck.fileKey)

    await purgeAbandonedImports(db)

    expect(await rowExists(stuck.id)).toBe(true)
    expect(await exists(stuck.path)).toBe(true)
  })
})
