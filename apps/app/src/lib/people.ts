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
} | null

/** What FR-9.2's credit line and FR-8.3's history both call an erased person. */
export const FORMER_CONTRIBUTOR = 'a former contributor'

/**
 * The name to show. Never "Unknown" and never an empty string: someone erased
 * is not missing, they have exercised a right, and the wording should not imply
 * a data problem.
 */
export function nameOf(person: Person): string {
  if (!person) return FORMER_CONTRIBUTOR
  return person.displayName ?? person.username ?? FORMER_CONTRIBUTOR
}

/** True when there is a profile to link to. An erased person has none. */
export function hasProfile(person: Person): person is { username: string } & object {
  return Boolean(person?.username)
}
