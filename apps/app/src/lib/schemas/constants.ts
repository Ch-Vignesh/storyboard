/**
 * Every numeric bound in the product, in one place (architecture section 6.2).
 * Client forms and tRPC inputs import from here. A bound that exists in two
 * files will drift; do not copy these numbers anywhere.
 */

/** FR-2.5 soft targets for a section. Warn above the max; never block. */
export const SECTION_WORDS = { softMin: 200, softMax: 2000 } as const

/** FR-5.3 */
export const REQUEST_TITLE_MAX_CHARS = 120
export const REQUEST_ASK_WORDS = { min: 20, max: 500 } as const

/** FR-5.4 */
export const REQUEST_PRE_CONTEXT_WORDS = { min: 100, max: 500 } as const

/** FR-5.7 */
export const REWRITE_TARGET_MIN_WORDS = 150
export const CONTINUE_TARGET_MAX_WORDS = 150

/** FR-5.8: defaults and the range an author may adjust them within. */
export const SUGGESTION_WORDS = {
  defaultMin: 150,
  defaultMax: 1000,
  floor: 100,
  ceiling: 2000,
} as const

/** FR-6.2 */
export const SUGGESTION_NOTE_MAX_WORDS = 200

/** FR-6.9 */
export const IDEA_WORDS = { min: 20, max: 400 } as const

/**
 * FR-13.2 with OD-6 resolved (decision 0016): submitted suggestions a person
 * may hold on one storyboard at a time. The owner has no ceiling on their own
 * storyboard; a co-author has a generous one; everyone else has three.
 */
export const SUGGESTION_QUOTA = {
  owner: Number.POSITIVE_INFINITY,
  coauthor: 10,
  contributor: 3,
} as const

/** FR-13.3 */
export const DAILY_LIMITS = {
  suggestionsSent: 10,
  ideasPosted: 20,
  ideasPerRequest: 3,
  storyboardsCreated: 5,
  spinOffsPerStoryboard: 1,
  /** Not in FR-13.3's list. A reporting endpoint with no ceiling is a
   * harassment tool, because the queue at the other end is a person's time. */
  reportsMade: 20,
} as const

/**
 * FR-13.3 on the unauthenticated surfaces. Generous, because the failure mode
 * of a tight limit here is a real person locked out of their own sign-up.
 */
export const AUTH_LIMITS = {
  signUpsPerAddress: 5,
  resendsPerAddress: 5,
} as const

/** FR-13.5 */
export const REPORTS_TO_SUSPEND = 10

/** SRS 3.1 */
export const COAUTHORS_MAX = 3

/** FR-2.1 */
export const STORYBOARD_GENRES = { min: 1, max: 3 } as const

/** FR-1.3 */
export const PINNED_GENRES_MIN = 3

/** FR-2.6 */
export const SOFT_DELETE_GRACE_DAYS = 30

/** FR-3.1 */
export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxWords: 300_000 } as const

/**
 * NFR-5 — reading comfort, as percentages of the manuscript tokens in
 * packages/ui (19px, line height 1.68). Decision 0009.
 */
export const READING_TYPE_SCALE = { min: 85, max: 150, default: 100, step: 5 } as const
export const READING_LINE_HEIGHT = { min: 140, max: 210, default: 168, step: 7 } as const

/** FR-12.4 */
export const QUIET_REQUEST_NUDGE_DAYS = 7
