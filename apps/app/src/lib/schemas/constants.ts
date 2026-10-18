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

/** Item 6.3 — an ask longer than this is folded in the composer behind "Read all". */
export const REQUEST_ASK_PREVIEW_CHARS = 240

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

/**
 * FR-6.2 — the note's column holds 1500 characters. Words alone did not bound
 * it: Chinese or Japanese has no spaces, so 3000 characters counted as a few
 * words, Postgres refused the row, and the refusal had already cost a send
 * (phase 12 audit).
 */
export const SUGGESTION_NOTE_MAX_CHARS = 1500

/** FR-5.6 and FR-5.5 — the request form's free text and lists. */
export const REQUEST_EXTRAS = {
  toneNotesMaxChars: 2000,
  constraintsMax: 10,
  constraintMaxChars: 200,
  readingListMax: 20,
} as const

/** FR-6.9 */
export const IDEA_WORDS = { min: 20, max: 400 } as const

/** Item 6.8 (D-7) — a reply is an answer, not an essay: one word is enough. */
export const IDEA_REPLY_WORDS = { min: 1, max: 400 } as const

/**
 * Item 6.8 — how long an idea may be changed by its writer after posting.
 * Long enough to fix what was meant; short enough that a reply never answers
 * words that have since been changed under it.
 */
export const IDEA_EDIT_MINUTES = 15

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
  /** Not in FR-13.3's list either. Each invitation notifies somebody, and
   * inviting and taking it back over and over is a way to keep doing so. */
  coauthorInvites: 10,
} as const

/**
 * FR-13.3 on the unauthenticated surfaces. Generous, because the failure mode
 * of a tight limit here is a real person locked out of their own sign-up.
 */
export const AUTH_LIMITS = {
  signUpsPerAddress: 5,
  resendsPerAddress: 5,
  /** FR-1.7, per hour: a reset link asked for again and again is somebody else asking. */
  resetsPerAddress: 5,
  /**
   * Item 3.1, per hour: tries at changing a password from settings, per
   * account and per client, so the current password cannot be guessed there.
   */
  passwordChangesPerAccountPerHour: 10,
  passwordChangesPerClientPerHour: 30,
  /** Item 3.2, per hour: links to confirm a new address, per account. */
  emailChangesPerAccountPerHour: 5,
  /** Item 3.13, per hour: pictures set, per account. Each one is decoded and resized. */
  avatarUploadsPerAccountPerHour: 20,
  /**
   * Item 3.14, per day: copies of your own data. One, because each one reads
   * and renders every story you own; the limit is taken after the request has
   * been validated, so a refusal costs nothing (decision 0037).
   */
  dataExportsPerAccountPerDay: 1,
  /**
   * Emails the sign-up, resend and reset forms may send for one client in a
   * day, whatever addresses it types. The per-address limits above do nothing
   * against a script that changes the address every time, and Gmail stops
   * sending for a day at about 500 (decision 0029): every real sign-up and
   * reset with it (phase 12 audit).
   */
  emailsPerClientPerDay: 20,
  /**
   * Sign-in attempts for one address from one client in `SIGN_IN_WINDOW_MINUTES`.
   * Keyed on both, so a stranger guessing at somebody's password cannot lock
   * the real owner out from their own device.
   */
  signInsPerAddressAndClient: 10,
  /** Sign-in attempts from one client, whatever addresses it tries. */
  signInsPerClient: 30,
} as const

/** The window `AUTH_LIMITS`' sign-in counts are taken over. */
export const SIGN_IN_WINDOW_MINUTES = 15

/**
 * D-15 (phase 14, item 3.3) — how long a session lasts. `slidingDays` is the
 * cookie's life, renewed as it is used; `absoluteDays` is the most a session
 * may be from the sign-in that made it, however active it is. The owner chose
 * 30 days for both.
 */
export const SESSION = { slidingDays: 30, absoluteDays: 30 } as const

/**
 * Prisma's interactive-transaction limits for the few writes that are many
 * rows at once: committing an import, purging a storyboard. Its defaults (2 s
 * to get a connection, 5 s to finish) suit a request; a novel is thousands of
 * rows (phase 12 audit). Kept under the platform's own function limit.
 */
export const BULK_WRITE_TRANSACTION = { maxWait: 10_000, timeout: 55_000 } as const

/**
 * FR-12.3 — how long one digest run may spend sending before it stops and
 * leaves the rest for the next. Under the platform's own five-minute function
 * limit, so a run that is cut short has already marked what it sent: a run
 * killed by the platform used to mark nothing, and everyone it had reached was
 * emailed again ten minutes later (phase 12 audit).
 */
export const DIGEST_RUN_BUDGET_SECONDS = 240

/**
 * Failed sends in a row after which a digest run stops. One bad address is
 * one failure and the run goes on; several in a row is the provider refusing
 * everything (a daily quota, an outage), and hammering it helps nobody.
 */
export const DIGEST_FAILURES_BEFORE_STOPPING = 3

/**
 * How many genre ids one request may carry, in onboarding, settings and the
 * browse filters. A bound on input size, not a product rule, so it sits well
 * above the number of genres. It was 24, written in three places, while the
 * seed has 25: picking every genre was refused as "more genres than exist"
 * (phase 12 audit).
 */
export const GENRE_SELECTION_MAX = 50

/** FR-11.3, FR-11.6 — the browse surfaces' search and page sizes. */
export const BROWSE_LIMITS = { queryMaxChars: 100, pageMax: 50, pageDefault: 24 } as const

/** A story's, chapter's or section's title. The columns hold 200 (`VarChar(200)`). */
export const TITLE_MAX_CHARS = 200

/** FR-1.3 — usernames: 3 to 30 characters. Passwords: 10 to 128. */
export const USERNAME_CHARS = { min: 3, max: 30 } as const
export const PASSWORD_CHARS = { min: 10, max: 128 } as const

/** Item 3.8 — the display name and the bio (`User.bio` is VARCHAR(280)). */
export const PROFILE_CHARS = { displayName: { min: 1, max: 80 }, bio: { max: 280 } } as const

/**
 * Phase 14, item 3.13 (D-5) — a profile picture is an icon, not a portrait.
 * Whatever is uploaded, up to `maxUploadBytes`, is cut to a centred square
 * and shrunk to `sizePx` a side as WebP: enough for the 24 to 48 pixels it is
 * ever drawn at on a sharp screen, and a few kilobytes in the database.
 * `maxStoredBytes` is the bound the shrink must come in under, which the
 * test checks and the procedure refuses to exceed.
 */
export const AVATAR = {
  maxUploadBytes: 5 * 1024 * 1024,
  sizePx: 96,
  maxStoredBytes: 24 * 1024,
  /** What the upload may be; the bytes are checked, not the declared type. */
  types: ['image/jpeg', 'image/png', 'image/webp'],
} as const

/**
 * FR-4.4 — a private draft after this many seconds without typing, and a
 * durable revision every this many minutes of continuous editing.
 */
export const DRAFT_IDLE_SECONDS = 3
export const REVISION_INTERVAL_MINUTES = 5

/**
 * FR-8.3 — the history panel's page of revisions, and the longest chain it
 * walks. The chain is append-only, so the cap guards against a cycle that
 * should be impossible rather than an expected length.
 */
export const HISTORY = { pageDefault: 50, pageMax: 200, chainMax: 5000 } as const

/** FR-12.1 (phase 14, item 6.9) — notifications per page; "Show older" fetches the next by cursor. */
export const NOTIFICATION_PAGE = 30

/** FR-11.1 (item 6.14) — how many of each kind the dashboard's "Needs you" lists. */
export const NEEDS_YOU = { suggestions: 20, requests: 10 } as const

/** FR-15.4 — what the seeded library should hold at launch. */
export const SEED_TARGETS = {
  storyboards: 25,
  genres: 6,
  openRequests: 40,
  answeredRequests: 15,
} as const

/** FR-9.3, FR-9.4 — how many credits, and passed suggestions, a profile lists at a time; "Show older" pages on (item 6.10). */
export const PROFILE_LISTS = { credits: 100, passed: 50 } as const

/** FR-12.3 — how far back the weekly digest looks. */
export const WEEKLY_DIGEST_DAYS = 7

/** FR-1.4 — how long a confirmation link works. */
export const VERIFICATION_TOKEN_TTL_HOURS = 24

/** FR-1.4 — the wait between two auth emails to one address, of any kind. */
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60

/**
 * FR-1.7 — how long a password reset link works. An hour, where a sign-up link
 * has a day: this one changes the password of an account that already exists,
 * so it should not sit in an inbox for long.
 */
export const PASSWORD_RESET_TTL_MINUTES = 60

/**
 * Phase 14, item 3.2 — how long a link to confirm a new email address works,
 * and how recently a Google-only account must have signed in to ask for one,
 * since it has no password to prove itself with.
 */
export const EMAIL_CHANGE_TTL_MINUTES = 60
export const RECENT_SIGN_IN_MINUTES = 10

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

/**
 * Decision 0033 — how long a nightly backup is kept. The number the backup
 * workflow uses lives in that workflow; this one is what the privacy policy
 * says (item 2.1), and the two are kept the same by hand.
 */
export const BACKUP_RETENTION_DAYS = 30

/**
 * OD-3, second half (decision 0024). Shorter than a storyboard's thirty days,
 * and deliberately: a storyboard is a thing somebody may want back, an account
 * is a person asking to be gone. Seven days is long enough to undo a click made
 * in anger, or to catch an account somebody else got into and tried to destroy,
 * and short enough to still read as prompt erasure.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 7

/**
 * Phase 14, item 3.12 — an address that signed up and never confirmed is a
 * row with an email in it and nothing else. Thirty days is long enough for
 * the slowest "I'll finish that later", after which keeping somebody's
 * address for an account they never had is the thing the privacy policy
 * would have to explain.
 */
export const UNCONFIRMED_ACCOUNT_RETENTION_DAYS = 30

/**
 * Item 3.12 — how long a used or expired sign-in link (confirmation, reset,
 * email change) is kept before the daily prune drops it. A week, so a link
 * opened late can still be told apart from one that never existed (item 1.16).
 */
export const USED_TOKEN_RETENTION_DAYS = 7

/** FR-3.1 */
export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxWords: 300_000 } as const

/**
 * FR-3.1 — an import is working state, not a record. A day after its last
 * change, its uploaded file and its row are deleted, finished or not: an
 * upload somebody walked away from is still their whole manuscript.
 */
export const IMPORT_JOB_RETENTION_HOURS = 24

/**
 * NFR-5 — reading comfort, as percentages of the manuscript tokens in
 * packages/ui (19px, line height 1.68). Decision 0009.
 */
export const READING_TYPE_SCALE = { min: 85, max: 150, default: 100, step: 5 } as const
export const READING_LINE_HEIGHT = { min: 140, max: 210, default: 168, step: 7 } as const

/** FR-12.4 */
export const QUIET_REQUEST_NUDGE_DAYS = 7

/**
 * FR-11.3 with D-8 (item 6.15, decision 0050) — a request closes by itself
 * this many days after it was opened, or last opened again.
 */
export const REQUEST_OPEN_DAYS = 30

/**
 * FR-12 over SMTP (decision 0029). A sign-up waits on its verification email,
 * so a mail server that stops answering has to fail the request in seconds —
 * the library's own defaults are two minutes to connect and ten to idle.
 */
export const SMTP_TIMEOUTS_MS = { connect: 10_000, greeting: 10_000, socket: 20_000 } as const

/**
 * Phase 10. A tRPC call slower than this is logged with its path. Warm, a call
 * here takes tens of milliseconds next to the database; half a second is worth
 * a line in the log.
 */
export const SLOW_PROCEDURE_MS = 500

/**
 * Phase 14, item 1.18 — how long the browser's time-zone cookie lives. A
 * necessary cookie (no consent banner): it holds a zone name, nothing else.
 */
export const TIME_ZONE_COOKIE_DAYS = 365

/**
 * Decision 0043 (phase 14, item 2b.4) — `User.lastSeenAt` is written by the
 * session read at most this often, and the admin's overview counts the
 * accounts seen, and the accounts new, within these windows.
 */
export const LAST_SEEN_TOUCH_HOURS = 1
export const OVERVIEW_WINDOW_DAYS = { recent: 7, month: 30 } as const

/**
 * Decision 0043 (phase 14, item 2b.5) — the note an administrator leaves with
 * a suspension, a ban or a deletion. `User.standingNote` is VARCHAR(500).
 */
export const STANDING_NOTE_MAX_CHARS = 500
