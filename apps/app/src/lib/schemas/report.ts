import { z } from 'zod'

import { CONTROL_CHARACTERS } from './help'

/**
 * FR-13.5 — reporting.
 *
 * Five categories and no free-text-only option, for the same reason FR-6.10's
 * pass chips are a fixed list: a category can be counted, triaged and reasoned
 * about, and an essay cannot. The optional note is there for the one case a
 * category never covers.
 */

export const REPORT_TARGETS = ['USER', 'STORYBOARD', 'SUGGESTION', 'IDEA'] as const
export type ReportTarget = (typeof REPORT_TARGETS)[number]

export const REPORT_CATEGORIES = [
  {
    value: 'SPAM' as const,
    label: 'Spam',
    blurb: 'Advertising, link-dropping, or the same thing posted over and over.',
  },
  {
    value: 'ABUSE' as const,
    label: 'Abuse or harassment',
    blurb: 'Aimed at a person rather than at the writing.',
  },
  {
    value: 'PLAGIARISM' as const,
    label: 'Plagiarism',
    blurb: 'Presented as their own writing when it is somebody else’s.',
  },
  {
    value: 'LIFTED_WORK' as const,
    label: 'Lifted from someone here',
    blurb: 'Copied out of another storyboard on this site.',
  },
  {
    value: 'OFF_TOPIC' as const,
    label: 'Off topic',
    blurb: 'Not an attempt to help with what was asked.',
  },
]

export const reportCategorySchema = z.enum([
  'SPAM',
  'ABUSE',
  'PLAGIARISM',
  'OFF_TOPIC',
  'LIFTED_WORK',
])

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1),
  category: reportCategorySchema,
  note: z
    .string()
    .trim()
    .max(1000, 'Keep it under 1000 characters.')
    // The same refusal every other free-text field carries. One copy of the
    // rule, in help.ts, because two copies drift.
    .refine((value) => !CONTROL_CHARACTERS.test(value), 'That text cannot be used here.')
    .optional(),
})

/** What the reporter is told afterwards. Deliberately not "we will look into it". */
export const REPORT_COPY = {
  thanks:
    'Reported. Nobody is told who reported what, and you will not hear back about this one unless it needs you.',
  duplicate: 'You have already reported this.',
  /** FR-13.5 — counts are never shown publicly, so neither is this one. */
  never: 'Report counts are not public, on anybody.',
} as const

export const TARGET_LABELS: Record<ReportTarget, string> = {
  USER: 'this writer',
  STORYBOARD: 'this storyboard',
  SUGGESTION: 'this suggestion',
  IDEA: 'this idea',
}
