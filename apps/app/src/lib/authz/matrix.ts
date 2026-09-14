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
  'report:create',
] as const

export type MatrixAction = (typeof MATRIX_ACTIONS)[number]

/** What each capability is called in the SRS, for test names and error copy. */
export const ACTION_LABELS: Record<MatrixAction, string> = {
  'storyboard:readPublic': 'Read public storyboard',
  'storyboard:readPrivate': 'Read private storyboard',
  'storyboard:edit': 'Edit main draft directly',
  'storyboard:structure': 'Create / reorder chapters and sections',
  'request:open': 'Open a contribution request',
  'suggestion:decide': 'Accept or pass on a suggestion',
  'revision:restore': 'Restore an earlier revision',
  'version:create': 'Create an alternate version',
  'coauthor:invite': 'Invite a co-author',
  'storyboard:setVisibility': 'Change visibility',
  'storyboard:delete': 'Delete storyboard',
  'suggestion:submit': 'Submit a suggestion',
  'idea:post': 'Post an idea',
  'storyboard:spinOff': 'Spin off (own copy)',
  'report:create': 'Report a user or storyboard',
}

/**
 * The table itself. Read it against the SRS row by row; it is in the same order
 * and uses the same wording via ACTION_LABELS.
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
  'report:create': { owner: true, coauthor: true, reader: true, guest: false },
}

/** Capabilities that change the work or the storyboard, as opposed to reading it. */
export const WRITE_ACTIONS: ReadonlySet<MatrixAction> = new Set(
  MATRIX_ACTIONS.filter(
    (action) => action !== 'storyboard:readPublic' && action !== 'storyboard:readPrivate',
  ),
)
