import type { PrismaClient } from '../../../src/generated/prisma/client'

import { SEED_HELPERS } from './library'

/** The account every seeded storyboard belongs to (FR-15.3). */
export const PLATFORM_ACCOUNT = {
  // The key the seed finds this account by, and never shown, so it kept the
  // old name through the rename to Draftboard; everything shown did not.
  email: 'examples@storyboard.invalid',
  username: 'draftboard-examples',
  displayName: 'Draftboard examples',
  bio: 'Public-domain manuscripts, posted as examples of how a story reads.',
} as const

/** Who the seeded content belongs to, by id, for the seeders that write it. */
export type SeedAccounts = {
  platformId: string
  /** The example helpers (FR-15.3), by username. */
  helpers: ReadonlyMap<string, string>
}

type Shown = { username: string; displayName: string; bio: string }

/**
 * The platform account and the example helpers, made if missing and kept
 * current if not (FR-15.3, FR-15.6).
 *
 * None of them has a password hash or a verified address, so none can be
 * signed into: they exist to own examples, nothing else.
 *
 * What is shown is written only when it differs. An upsert wrote every row on
 * every run, and `User.updatedAt` with it, so "a second seed changes nothing"
 * was true of the words and not of the rows (phase 14, item 9.5).
 */
export async function ensureSeedAccounts(prisma: PrismaClient): Promise<SeedAccounts> {
  const platformId = await ensureAccount(prisma, PLATFORM_ACCOUNT.email, PLATFORM_ACCOUNT)

  // FR-15.3 — the contributors of the seeded suggestions and ideas are seeded
  // accounts too, and say so on their profiles. A credit line pointing at an
  // invented person would be the fake community the requirement forbids.
  const helpers = new Map<string, string>()
  for (const helper of SEED_HELPERS) {
    helpers.set(
      helper.username,
      await ensureAccount(prisma, `${helper.username}@storyboard.invalid`, helper),
    )
  }

  return { platformId, helpers }
}

async function ensureAccount(
  prisma: PrismaClient,
  email: string,
  { username, displayName, bio }: Shown,
): Promise<string> {
  const shown = { username, displayName, bio }
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, displayName: true, bio: true },
  })

  if (!existing) {
    const created = await prisma.user.create({
      data: { email, ...shown, onboardedAt: new Date() },
      select: { id: true },
    })
    return created.id
  }

  // Everything shown, kept current. It is how a database seeded as Storyboard
  // came to say Draftboard (phase 12).
  if (
    existing.username !== username ||
    existing.displayName !== displayName ||
    existing.bio !== bio
  ) {
    await prisma.user.update({ where: { id: existing.id }, data: shown })
  }
  return existing.id
}
