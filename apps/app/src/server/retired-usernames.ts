import { createHash } from 'node:crypto'

import type { Prisma, PrismaClient } from '@storyboard/db'

/**
 * Decision 0042 (phase 14, item 1.6) — a deleted account's username stays
 * retired. The purge writes the hash of the name; the username step refuses
 * any name whose hash is here. The hash is not secrecy (a username has too
 * little entropy for that, and the name is printed in credit lines anyway);
 * it is so the table does not read as a list of the erased.
 */

/**
 * The owner's choice (decision 0042, confirmed 2026-10-18): a retired name is
 * refused exactly as a taken one, so nothing says an account was deleted. The
 * same sentence serves the live-name refusal in `user.chooseUsername`.
 */
export const USERNAME_TAKEN_MESSAGE = 'That username is taken. Try another.'

export function retiredUsernameHash(username: string): string {
  return createHash('sha256').update(username.toLowerCase()).digest('hex')
}

type Db = Pick<PrismaClient | Prisma.TransactionClient, 'retiredUsername'>

export async function isRetiredUsername(db: Db, username: string): Promise<boolean> {
  const row = await db.retiredUsername.findUnique({
    where: { hash: retiredUsernameHash(username) },
    select: { hash: true },
  })
  return row !== null
}

/**
 * Decision 0043 (phase 14, item 2b.6) — bans a name nobody holds yet. The
 * name is kept in clear, so the Names screen can list it; a retired name
 * stays a hash alone (decision 0042) and is left as it is: null says the name
 * was already unavailable, and nothing says why.
 */
export async function banUsername(db: Db, username: string, note: string | null) {
  const name = username.toLowerCase()
  const hash = retiredUsernameHash(name)
  const existing = await db.retiredUsername.findUnique({
    where: { hash },
    select: { reason: true },
  })
  if (existing?.reason === 'RETIRED') return null
  return db.retiredUsername.upsert({
    where: { hash },
    create: { hash, reason: 'BANNED', name, note },
    update: { note },
    select: { name: true, note: true, retiredAt: true },
  })
}

/** Lifts a ban. A retired name is not a ban, and stays. */
export async function unbanUsername(db: Db, username: string): Promise<boolean> {
  const { count } = await db.retiredUsername.deleteMany({
    where: { hash: retiredUsernameHash(username), reason: 'BANNED' },
  })
  return count > 0
}
