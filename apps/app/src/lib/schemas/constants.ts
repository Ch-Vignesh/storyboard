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
 * FR-6.6 — how many times an accept is tried when Postgres refuses it as
 * unserialisable. At SERIALIZABLE it may refuse one of two transactions that
 * shared nothing, and two accepts on different sections then told the author
 * "this section changed" when nothing had (CI, 2026-10-24). Tried again, an
 * unrelated accept goes in, and a real collision is caught by the accept's own
 * checks. Every accept in a story also writes the story's `lastWrittenAt`, so
 * accepts there at the same moment go in one per round: five rounds carry an
 * owner and co-authors deciding at once. The wait before a round is random, up
 * to `jitterMs` doubled each time, so the ones that met part ways.
 */
export const SERIALIZABLE_RETRY = { attempts: 5, jitterMs: 20 } as const

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

/**
 * FR-11.3, FR-11.6 — the browse surfaces' search and page sizes. Stories come
 * a half page at a time (item 9.1): on browse they sit below the requests,
 * which are what the page is for.
 */
export const BROWSE_LIMITS = {
  queryMaxChars: 100,
  pageMax: 50,
  pageDefault: 24,
  storiesPage: 12,
} as const

/**
 * Phase 14, item 9.6 — the most a link preview's description says: a story's
 * logline, or the opening of its text cut at a word. About what search results
 * and chat previews show before they cut it themselves.
 */
export const PREVIEW_DESCRIPTION_CHARS = 160

/** A story's, chapter's or section's title. The columns hold 200 (`VarChar(200)`). */
export const TITLE_MAX_CHARS = 200
/**
 * Phase 14, item 10.5 — a story's logline and rights note (`updateStoryboardSchema`),
 * and a version's name (`Version.name` is VARCHAR(120)).
 */
export const STORY_DETAIL_CHARS = { logline: 300, rightsNote: 500 } as const
export const VERSION_NAME_MAX_CHARS = 120
/** FR-13.5 — the optional note with a report. */
export const REPORT_NOTE_MAX_CHARS = 1000
/**
 * FR-3.2 — the most chapters an import's outline may have, and sections in
 * one chapter: a section is a unit somebody writes in and asks for help on,
 * and thousands of them would be a way to make one request write a great
 * many rows rather than a manuscript.
 */
export const IMPORT_OUTLINE_MAX = { chapters: 500, sectionsPerChapter: 500 } as const

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
 * Phase 14, item 8.5 — a save that could not reach the server is tried again
 * after `firstMs`, doubling each time to at most `maxMs`, and at once when the
 * browser says it is back online. The words wait on the device meanwhile.
 */
export const SAVE_RETRY = { firstMs: 2_000, maxMs: 30_000 } as const

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

/**
 * FR-15.4 — what the seeded library should hold at launch. `openRewrites` is
 * phase 14's item 9.5: rewrites still open, across genres, where the library
 * had left every one answered.
 */
export const SEED_TARGETS = {
  storyboards: 25,
  genres: 6,
  openRequests: 40,
  answeredRequests: 15,
  openRewrites: 10,
} as const

/** FR-9.3, FR-9.4 — how many credits, and passed suggestions, a profile lists at a time; "Show older" pages on (item 6.10). */
export const PROFILE_LISTS = { credits: 100, passed: 50 } as const

/** FR-12.3 — how far back the weekly digest looks. */
export const WEEKLY_DIGEST_DAYS = 7

/**
 * FR-12.3 (phase 14, item 10.6; the phase 12 audit's H6b) — a reader sent the
 * weekly digest within this many days is skipped by the run: one repeated by
 * hand, or a late Sunday run followed by an on-time one, sends nobody a second
 * copy. Less than a week, so next Sunday's run still goes to everyone when
 * GitHub starts it earlier in the day than it started this one.
 */
export const WEEKLY_DIGEST_MIN_GAP_DAYS = 6

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

/** FR-13.7 (phase 14, item 9.3) — reports per page of the queue; "Show more" fetches the next. */
export const REPORT_QUEUE_PAGE = 50

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
/** Phase 14, item 7.5 — how long this device keeps the setting, as a necessary cookie. */
export const READING_COOKIE_DAYS = 365

/** FR-12.4 */
export const QUIET_REQUEST_NUDGE_DAYS = 7

/**
 * FR-11.3 with D-8 (item 6.15, decision 0050) — a request closes by itself
 * this many days after it was opened, or last opened again.
 */
export const REQUEST_OPEN_DAYS = 30

/**
 * Phase 14, items 7.1 and 7.3 (FR-11.5, FR-9.2) — the reader's margin. A card
 * carries the start of its request's ask, cut at a word, and the contributors
 * strip names this many people before its "All contributors" link.
 */
export const MARGIN_ASK_CHARS = 220
export const CONTRIBUTORS_STRIP_MAX = 5

/**
 * FR-10.5 (phase 14, item 7.11) — a spin-off's banner names this many
 * ancestors before "See the full lineage"; the lineage page walks back as far
 * as `walkMax` and says so when the chain goes further. Each step is a few
 * queries, which is what the cap is for.
 */
export const LINEAGE = { shown: 3, walkMax: 25 } as const

/**
 * Decision 0044 (phase 14, item 7b.1) — what an author may say about an
 * edition when they publish it. `Publication.note` is VARCHAR(280).
 */
export const PUBLICATION_NOTE_MAX_CHARS = 280

/** Phase 14, item 7.10 (FR-10.2) — how many promotions the Versions page lists. */
export const VERSION_EVENTS_SHOWN = 20

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

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — the server's own record of its faults.
 *
 * A row is kept `retentionDays` and dropped by the daily prune. What it keeps
 * is cut to fit its columns: `ServerError.message` is VARCHAR(500),
 * `.stack` VARCHAR(2000) (the top `stackFrames` frames), `.location`
 * VARCHAR(200), `.name` VARCHAR(100) and `.fingerprint` VARCHAR(32). One
 * instance writes a fault that repeats in a loop at most `perKindPerMinute`
 * times a minute, and keeps count of at most `kindsCounted` kinds while doing
 * so; the rest are in the host's logs. The hourly job emails the
 * administrators at most once in each `alertEveryMinutes`, and the Errors
 * screen lists `pageKinds` kinds at a time, as one email does.
 */
export const SERVER_ERRORS = {
  retentionDays: 30,
  messageMaxChars: 500,
  stackFrames: 8,
  stackMaxChars: 2000,
  locationMaxChars: 200,
  nameMaxChars: 100,
  fingerprintChars: 32,
  perKindPerMinute: 10,
  kindsCounted: 500,
  alertEveryMinutes: 60,
  pageKinds: 50,
} as const

/**
 * Phase 14, item 10.2 (NFR-7) — the stored record of socially significant
 * events (`AuditEvent`). Kept a year, long enough to see a pattern across
 * months and to answer an appeal, then dropped by the daily prune; the privacy
 * policy says so. The Events screen reads `page` at a time, and its story and
 * person filters take at most `filterMaxChars` (an address, or an email).
 */
export const AUDIT_LOG = { retentionDays: 365, page: 50, filterMaxChars: 320 } as const

/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — the feature flags there are: three
 * kill switches, each pausing one way in that a wave of spam or a fault would
 * come through. On means paused. The admin screen switches these and nothing
 * else; the seed creates them, off (`packages/db/prisma/seed/flags.ts` keeps
 * the same list, and `lib/flags.test.ts` holds the two together);
 * `lib/flags.ts` reads them.
 */
export const FEATURE_FLAG_KEYS = ['pause-sign-ups', 'pause-imports', 'pause-spin-offs'] as const

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number]

/** What each switch does, in the admin screen's words. `FeatureFlag.description` holds 300. */
export const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  'pause-sign-ups':
    'Stops new accounts: signing up, and signing in with a Google account that has not been here before. Everyone who has an account signs in as usual.',
  'pause-imports':
    'Stops bringing a manuscript in from a file. Stories already brought in are untouched, and writing one from scratch still works.',
  'pause-spin-offs':
    'Stops anyone writing their own version of a story. Spin-offs already made are untouched.',
}

/**
 * Item 9.4 — how long one server instance keeps a switch's position before
 * reading it again. A switch thrown in the admin screen takes hold at once on
 * the instance that served it, and everywhere else within this.
 */
export const FLAG_CACHE_SECONDS = 30
