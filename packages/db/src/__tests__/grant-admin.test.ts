/**
 * Decision 0043 — exactly one administrator, set by `grantAdmin` and kept by
 * the `one_admin` index, which refuses a second whatever the application
 * forgets.
 *
 * Needs a real Postgres with migrations applied, so it skips when DATABASE_URL
 * is unset. CI always runs it.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { grantAdmin } from '../admin'
import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('the one administrator (decision 0043)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  const ids: string[] = []
  let standing: string | null = null

  async function person(label: string) {
    const row = await db.user.create({
      data: {
        email: `adm-${label}-${run}@example.test`,
        username: `adm_${label}_${run}`,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    })
    ids.push(row.id)
    return row
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    // Whoever is the admin of this database gets the role back afterwards.
    standing =
      (await db.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true } }))?.email ??
      null
  })

  afterAll(async () => {
    await db.user.updateMany({ where: { id: { in: ids } }, data: { role: 'USER', isAdmin: false } })
    if (standing) await grantAdmin(db, standing)
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  })

  it('moves the role from one account to the next, and never holds two', async () => {
    const first = await person('first')
    const second = await person('second')

    await grantAdmin(db, first.email)
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: first.id } })).role).toBe('ADMIN')

    const moved = await grantAdmin(db, second.email)
    expect(moved.demoted).toEqual([first.email])
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: first.id } })).role).toBe('USER')
    expect((await db.user.findUniqueOrThrow({ where: { id: second.id } })).role).toBe('ADMIN')

    // The index, not the function, is the rule: a second admin written by
    // hand is refused by the database.
    await expect(
      db.user.update({ where: { id: first.id }, data: { role: 'ADMIN' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('refuses an address nobody has', async () => {
    await expect(grantAdmin(db, `nobody-${run}@example.test`)).rejects.toThrow(/No account/u)
  })
})
