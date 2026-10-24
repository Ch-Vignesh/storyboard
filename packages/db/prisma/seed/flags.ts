/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — the kill switches, so the admin
 * screen has all three from the first deploy, each of them off.
 *
 * Idempotent (FR-15.6): a switch that exists keeps the position an
 * administrator left it in, and only its words are brought up to date. A seed
 * run during an incident must never switch a pause off.
 *
 * The same keys and words as `FEATURE_FLAG_KEYS` and
 * `FEATURE_FLAG_DESCRIPTIONS` in `apps/app/src/lib/schemas/constants.ts`,
 * copied because `packages/db` must not depend on the application; the
 * application's `lib/flags.test.ts` fails if the two part.
 */

import type { PrismaClient } from '../../src/generated/prisma/client'

export type SeededFlag = { key: string; description: string }

export const SEEDED_FLAGS: readonly SeededFlag[] = [
  {
    key: 'pause-sign-ups',
    description:
      'Stops new accounts: signing up, and signing in with a Google account that has not been here before. Everyone who has an account signs in as usual.',
  },
  {
    key: 'pause-imports',
    description:
      'Stops bringing a manuscript in from a file. Stories already brought in are untouched, and writing one from scratch still works.',
  },
  {
    key: 'pause-spin-offs',
    description:
      'Stops anyone writing their own version of a story. Spin-offs already made are untouched.',
  },
]

/** Ensures each switch exists. Returns how many were new, every one of them off. */
export async function seedFlags(
  db: Pick<PrismaClient, 'featureFlag'>,
  flags: readonly SeededFlag[] = SEEDED_FLAGS,
): Promise<{ created: number }> {
  let created = 0
  for (const flag of flags) {
    const before = await db.featureFlag.findUnique({
      where: { key: flag.key },
      select: { key: true },
    })
    await db.featureFlag.upsert({
      where: { key: flag.key },
      create: { key: flag.key, description: flag.description, enabled: false },
      update: { description: flag.description },
    })
    if (!before) created += 1
  }
  return { created }
}
