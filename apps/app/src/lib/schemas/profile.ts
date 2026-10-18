import { z } from 'zod'

import { FORMER_CONTRIBUTOR, FORMER_MEMBER } from '@/lib/people'

import { isReservedUsername } from './auth'
import { PROFILE_CHARS } from './constants'

/**
 * Phase 14, item 3.8 — what a display name and a bio may be. Both are free
 * text, so the rules are about what they must not be: a name that reads as
 * somebody else, or as nobody, and characters that are not writing.
 *
 * `\p{Cc}` is the control characters and `\p{Cf}` the format characters:
 * direction overrides, zero-width joiners and the like, which can make one
 * name look like another or hide inside one. A bio keeps its line breaks.
 */
const UNWRITABLE = /[\p{Cc}\p{Cf}]/gu
const UNWRITABLE_BUT_NEWLINE = /(?![\n])[\p{Cc}\p{Cf}]/gu

/** Names nobody may show as, compared ignoring case. */
export const POSING_NAMES = [
  FORMER_MEMBER,
  FORMER_CONTRIBUTOR,
  'Draftboard',
  'Draftboard examples',
  'Draftboard team',
  'Draftboard staff',
  'Draftboard support',
] as const

export function posesAsSomeoneElse(name: string): boolean {
  const lowered = name.trim().toLowerCase()
  return (
    POSING_NAMES.some((posing) => posing.toLowerCase() === lowered) || isReservedUsername(lowered)
  )
}

export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(UNWRITABLE, '').replace(/\s+/gu, ' ').trim())
  .pipe(
    z
      .string()
      .min(PROFILE_CHARS.displayName.min, 'Give yourself a name to show.')
      .max(PROFILE_CHARS.displayName.max, 'That name is too long.')
      .refine((value) => !posesAsSomeoneElse(value), 'That name would read as somebody else.'),
  )

/** An empty bio is no bio: the output is `null` rather than an empty string. */
export const bioSchema = z
  .string()
  .transform((value) => value.replace(UNWRITABLE_BUT_NEWLINE, '').trim())
  .pipe(
    z
      .string()
      .max(PROFILE_CHARS.bio.max, `Keep it under ${String(PROFILE_CHARS.bio.max)} characters.`),
  )
  .transform((value) => (value === '' ? null : value))
