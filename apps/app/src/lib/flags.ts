import 'server-only'

import { prisma, type PrismaClient } from '@storyboard/db'

import { FLAG_CACHE_SECONDS, type FeatureFlagKey } from '@/lib/schemas/constants'

/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — the kill switches, read.
 *
 * Until this, flags could be made and switched in the admin screen and
 * nothing read them. Now each switch is read by the one way in it pauses:
 * `auth.signUp` and a first Google sign-in (`pause-sign-ups`),
 * `import.createUpload` (`pause-imports`) and `spinOff.create`
 * (`pause-spin-offs`). Each refuses with its sentence below.
 *
 * A switch that has no row is off: the seed makes the rows, and a deployment
 * that has not run it yet must not refuse anybody for want of one. Each
 * instance keeps a position for `FLAG_CACHE_SECONDS`, so the switch costs one
 * lookup by primary key per half minute, not one per sign-up.
 */

type FlagReader = Pick<PrismaClient, 'featureFlag'>

const kept = new Map<FeatureFlagKey, { on: boolean; until: number }>()

/** Whether a switch is on (the thing it names is paused). */
export async function isOn(
  key: FeatureFlagKey,
  db: FlagReader = prisma,
  now: number = Date.now(),
): Promise<boolean> {
  const known = kept.get(key)
  if (known && known.until > now) return known.on

  const row = await db.featureFlag.findUnique({ where: { key }, select: { enabled: true } })
  const on = row?.enabled ?? false
  kept.set(key, { on, until: now + FLAG_CACHE_SECONDS * 1000 })
  return on
}

/**
 * Forget what this instance knows of a switch, or of all of them: after the
 * admin screen throws one, so the instance that served it obeys at once.
 */
export function forgetFlags(key?: FeatureFlagKey): void {
  if (key) kept.delete(key)
  else kept.clear()
}

/**
 * What a refusal says, in the words the person reads. Each says what is
 * paused, that it is not them, and that nothing of theirs was lost.
 */
export const PAUSED: Record<FeatureFlagKey, string> = {
  'pause-sign-ups':
    'Draftboard is not taking new accounts just now. Nothing was sent to your address; try again later.',
  'pause-imports':
    'Bringing a manuscript in from a file is paused for now. Nothing was uploaded; try again later, or start the story by hand.',
  'pause-spin-offs':
    'Writing your own version of a story is paused for now. Nothing was copied; try again later.',
}
