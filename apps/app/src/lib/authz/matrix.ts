/**
 * The permission matrix from `docs/01-srs.md` section 3.2, transcribed as a
 * table (architecture section 7).
 *
 * This file is deliberately dumb: roles down one axis, capabilities across the
 * other, booleans in the cells and no logic at all. Everything that depends on
 * the *resource* — visibility, soft deletion, a suspended account — lives in
 * `can()` next door, so that the table stays readable against the SRS and one
 * unit test can cover every cell.
 *
 * Do not add a capability here without adding the row to the SRS first.
 */

/**
 * Contributor is deliberately absent: "contributor status is a historical
 * fact, not a live permission grant" (SRS section 3.1). Someone who once had a
 * suggestion accepted is a `reader` here, exactly like anyone else.
 */
export const ROLES = ['owner', 'coauthor', 'reader', 'guest'] as const

export type Role = (typeof ROLES)[number]

/**
 * One entry per row of the SRS table, in the order the SRS lists them.
 * The `storyboard:readPublic` / `storyboard:readPrivate` pair is the one place
 * the table is split by resource state; `can()` picks the row.
 */
export const MATRIX_ACTIONS = [
  'storyboard:readPublic',
  'storyboard:readPrivate',
  'storyboard:edit',
  'storyboard:structure',
  'request:open',
  'suggestion:decide',
  'revision:restore',
  'version:create',
  'coauthor:invite',
  'storyboard:setVisibility',
  'storyboard:delete',
  'suggestion:submit',
  'idea:post',
  'storyboard:spinOff',
  'storyboard:export',
  'report:create',
] as const

export type MatrixAction = (typeof MATRIX_ACTIONS)[number]

/** What each capability is called in the SRS, for test names and error copy. */
export const ACTION_LABELS: Record<MatrixAction, string> = {
  // In the interface's words (SRS section 2), not the SRS table's: a refusal
  // shows the label to the person, so "Delete storyboard" put a banned word on
  // screen until phase 14 (item 1.13). The keys name the SRS rows.
  'storyboard:readPublic': 'Read a public story',
  'storyboard:readPrivate': 'Read a private story',
  'storyboard:edit': 'Edit the main draft',
  'storyboard:structure': 'Add, rename or reorder chapters and sections',
  'request:open': 'Ask for help on a section',
  'suggestion:decide': 'Accept or pass on a suggestion',
  'revision:restore': 'Restore an earlier version',
  'version:create': 'Start an alternate version',
  'coauthor:invite': 'Invite a co-author',
  'storyboard:setVisibility': 'Change who can read a story',
  'storyboard:delete': 'Delete a story',
  'suggestion:submit': 'Send a suggestion',
  'idea:post': 'Post an idea',
  'storyboard:spinOff': 'Write your own version of a story',
  'storyboard:export': 'Take the manuscript out as a file',
  'report:create': 'Report a person or a story',
}

/**
 * The table itself. Read it against the SRS row by row; it is in the same order,
 * and each key names its SRS row.
 *
 * The starred cells in the SRS (owner and co-author submitting a suggestion)
 * are `true` here: the star is about bypassing the three-suggestion quota
 * (FR-13.2), which is a rate limit rather than a permission, and is enforced
 * in `suggestion.submit` in phase 2.
 */
export const MATRIX: Record<MatrixAction, Record<Role, boolean>> = {
  'storyboard:readPublic': { owner: true, coauthor: true, reader: true, guest: true },
  'storyboard:readPrivate': { owner: true, coauthor: true, reader: false, guest: false },
  'storyboard:edit': { owner: true, coauthor: true, reader: false, guest: false },
  'storyboard:structure': { owner: true, coauthor: true, reader: false, guest: false },
  'request:open': { owner: true, coauthor: true, reader: false, guest: false },
  'suggestion:decide': { owner: true, coauthor: true, reader: false, guest: false },
  'revision:restore': { owner: true, coauthor: true, reader: false, guest: false },
  'version:create': { owner: true, coauthor: true, reader: false, guest: false },
  'coauthor:invite': { owner: true, coauthor: false, reader: false, guest: false },
  'storyboard:setVisibility': { owner: true, coauthor: false, reader: false, guest: false },
  'storyboard:delete': { owner: true, coauthor: false, reader: false, guest: false },
  'suggestion:submit': { owner: true, coauthor: true, reader: true, guest: false },
  'idea:post': { owner: true, coauthor: true, reader: true, guest: false },
  'storyboard:spinOff': { owner: true, coauthor: true, reader: true, guest: false },
  // FR-14 is an author's tool, not a reader's. A reader can already copy what
  // they read (FR-13.6 says so plainly), but handing them a formatted download
  // of somebody's unfinished novel is a convenience its author never asked us
  // to provide. Spinning off is the reader's route to the words.
  'storyboard:export': { owner: true, coauthor: true, reader: false, guest: false },
  'report:create': { owner: true, coauthor: true, reader: true, guest: false },
}

/** Capabilities that change the work or the storyboard, as opposed to reading it. */
export const WRITE_ACTIONS: ReadonlySet<MatrixAction> = new Set(
  MATRIX_ACTIONS.filter(
    (action) => action !== 'storyboard:readPublic' && action !== 'storyboard:readPrivate',
  ),
)
