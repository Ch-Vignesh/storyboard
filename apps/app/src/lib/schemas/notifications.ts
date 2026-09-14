/**
 * The twelve notification types (FR-12.2), with the words the interface uses
 * for each and how each one is delivered (FR-12.3).
 *
 * One table, because a type that exists in the enum but not here would be
 * silently undeliverable, and a type here that is not in the enum would not
 * compile.
 */

export const NOTIFICATION_TYPES = [
  'SUGGESTION_RECEIVED',
  'SUGGESTION_ACCEPTED',
  'SUGGESTION_PASSED',
  'SUGGESTION_STALE',
  'IDEA_RECEIVED',
  'IDEA_MARKED_HELPFUL',
  'COAUTHOR_INVITED',
  'COAUTHOR_ACCEPTED',
  'SPIN_OFF_CREATED',
  'CONTRIBUTION_REMOVED',
  'REQUEST_QUIET_SEVEN_DAYS',
  'WEEKLY_DIGEST',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * FR-12.3 — "immediate for decisions on your own work, hourly digest for
 * everything else, weekly digest on Sunday".
 *
 * `immediate` is therefore not a preference about urgency; it is the list of
 * things that happened *to what you made*, where a delay is the difference
 * between a reply and a shrug.
 */
export type Delivery = 'immediate' | 'hourly' | 'weekly'

type Definition = {
  /** What the notification centre shows. */
  label: string
  /** How the row reads, given its payload. Kept short: the link carries the rest. */
  sentence: string
  delivery: Delivery
  /** FR-12.1 — every type is independently toggleable for email. */
  canDisableEmail: boolean
}

export const NOTIFICATIONS: Record<NotificationType, Definition> = {
  SUGGESTION_RECEIVED: {
    label: 'A suggestion arrived',
    sentence: 'Someone sent a suggestion for a passage you opened for help.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  SUGGESTION_ACCEPTED: {
    label: 'Your suggestion was accepted',
    sentence: 'An author accepted your writing into their main draft.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  SUGGESTION_PASSED: {
    label: 'An author went a different way',
    sentence: 'Your suggestion was not used. It is still yours, and still readable.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  SUGGESTION_STALE: {
    label: 'The section you helped with changed',
    sentence: 'Update your suggestion against the new text, or leave it.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  IDEA_RECEIVED: {
    label: 'An idea arrived',
    sentence: 'Someone posted an idea on a passage you opened for help.',
    delivery: 'hourly',
    canDisableEmail: true,
  },
  IDEA_MARKED_HELPFUL: {
    label: 'Your idea helped',
    sentence: 'An author marked your idea as the one that unstuck them.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  COAUTHOR_INVITED: {
    label: 'You were invited to co-author',
    sentence: 'An author asked you to write with them.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  COAUTHOR_ACCEPTED: {
    label: 'Your invitation was accepted',
    sentence: 'Someone you invited is now a co-author.',
    delivery: 'hourly',
    canDisableEmail: true,
  },
  SPIN_OFF_CREATED: {
    label: 'Someone spun your story off',
    sentence: 'A writer started their own version from yours.',
    delivery: 'hourly',
    canDisableEmail: true,
  },
  CONTRIBUTION_REMOVED: {
    label: 'Your writing is no longer in the draft',
    sentence:
      'An author restored an earlier version. Your contribution still stands and is still on your profile.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  REQUEST_QUIET_SEVEN_DAYS: {
    label: 'Nobody has answered yet',
    sentence: 'A passage you opened for help has had no answers for a week.',
    delivery: 'immediate',
    canDisableEmail: true,
  },
  WEEKLY_DIGEST: {
    label: 'This week in your genres',
    sentence: 'Passages opened for help in the genres you pinned.',
    delivery: 'weekly',
    canDisableEmail: true,
  },
}

/** The types that make up the hourly digest (FR-12.3). */
export const HOURLY_TYPES = NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATIONS[type].delivery === 'hourly',
)

/** The types that are emailed the moment they happen. */
export const IMMEDIATE_TYPES = NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATIONS[type].delivery === 'immediate',
)
