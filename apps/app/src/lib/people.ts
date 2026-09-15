/**
 * How a person is named in the interface.
 *
 * Authorship can be absent (decision 0013): a contributor may erase their
 * record, which clears `Revision.authorId` and `Credit.contributorId` while
 * leaving the writing and the count exactly where they were. Every surface that
 * renders a name therefore has to render its absence too, and it should say the
 * same thing everywhere — hence one function rather than a dozen `?? 'Unknown'`.
 */

export type Person = {
  id?: string
  username?: string | null
  displayName?: string | null
  /** Select it where you can: it is what separates the two cases below. */
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED' | null
} | null

/** What FR-9.2's credit line and FR-8.3's history both call an erased person. */
export const FORMER_CONTRIBUTOR = 'a former contributor'

/**
 * Someone who deleted their whole account (decision 0024), as opposed to
 * someone who erased one credit.
 *
 * Two strings rather than one because the two situations are genuinely
 * different and the difference is visible. "Credited to a former contributor"
 * is exactly right on a contributors page. The same words under a novel's title
 * — "by a former contributor" — say the wrong thing about somebody who wrote
 * the whole book and then left.
 */
export const FORMER_MEMBER = 'a former member'

/**
 * The name to show. Never "Unknown" and never an empty string: someone erased
 * is not missing, they have exercised a right, and the wording should not imply
 * a data problem.
 *
 * A deleted account keeps its row with the identifying columns stripped, so it
 * arrives here looking exactly like an erased credit. `status` is what tells
 * them apart; a query that does not select it degrades to the older wording
 * rather than to something wrong.
 */
export function nameOf(person: Person): string {
  if (!person) return FORMER_CONTRIBUTOR
  const fallback = person.status === 'DELETED' ? FORMER_MEMBER : FORMER_CONTRIBUTOR
  return person.displayName ?? person.username ?? fallback
}

/** True when there is a profile to link to. An erased person has none. */
export function hasProfile(person: Person): person is { username: string } & object {
  return Boolean(person?.username)
}
