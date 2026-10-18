import { z } from 'zod'

import { GENRE_SELECTION_MAX, PINNED_GENRES_MIN } from './constants'

/**
 * FR-1.3 steps 3 and 4. The username schema itself lives in `auth.ts` beside
 * the other credential rules; this file is the two onboarding inputs, shared
 * by the forms and the tRPC procedures so a bound cannot drift between them.
 */

/** FR-1.3 — at least three, ordered as the user ranked them (FR-11.2). */
export const pinGenresSchema = z.object({
  genreIds: z
    .array(z.string().min(1))
    .min(PINNED_GENRES_MIN, `Pick at least ${PINNED_GENRES_MIN} genres.`)
    .max(GENRE_SELECTION_MAX, 'That is more genres than exist.')
    .refine((ids) => new Set(ids).size === ids.length, 'Pick each genre once.'),
  /**
   * FR-13.4 (phase 14, item 2.3) — the last onboarding step shows the rules
   * and asks for this tick. Required by the procedure for an account that has
   * not read them yet; absent when settings re-pins genres later.
   */
  rulesRead: z.boolean().optional(),
})

/**
 * FR-13.4 (item 2.3) — the six rules in a line each, for the last onboarding
 * step. The page at /rules says the rest; this is so nobody finishes without
 * having met them.
 */
export const RULES_SUMMARY = [
  'A good suggestion answers what was asked, in the author’s voice rather than yours.',
  'Three suggestions waiting at a time, per story.',
  'An author can pass on a suggestion without explaining.',
  'You are reading work nobody has published.',
  'Credit travels with the writing, for ever.',
  'Nothing here is private: everything anyone writes is attached to a piece of work.',
] as const

/**
 * Shown on the username step. Not a validation rule — a promise the product
 * has to keep, so the copy lives next to the schema that enforces it.
 */
export const USERNAME_PERMANENCE_WARNING =
  'You cannot change this later. It appears in your credit line on every contribution you make.'
