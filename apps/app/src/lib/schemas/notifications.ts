/**
 * The notification types (FR-12.2), with the words the interface uses
 * for each and how each one is delivered (FR-12.3).
 *
 * One table, because a type that exists in the enum but not here would be
 * silently undeliverable, and a type here that is not in the enum would not
 * compile.
 */

import { FORMER_CONTRIBUTOR, FORMER_MEMBER } from '@/lib/people'
import { REQUEST_OPEN_DAYS } from '@/lib/schemas/constants'

export const NOTIFICATION_TYPES = [
  'SUGGESTION_RECEIVED',
  'SUGGESTION_ACCEPTED',
  'SUGGESTION_PASSED',
  'SUGGESTION_STALE',
  'SUGGESTION_WITHDRAWN',
  'IDEA_RECEIVED',
  'IDEA_MARKED_HELPFUL',
  'IDEA_REPLY',
  'COAUTHOR_INVITED',
  'COAUTHOR_ACCEPTED',
  'SPIN_OFF_CREATED',
  'CONTRIBUTION_REMOVED',
  'REQUEST_QUIET_SEVEN_DAYS',
  'REQUEST_CLOSED',
  'REQUEST_REOPENED',
  'REQUEST_AUTO_CLOSED',
  'SPIN_OFF_PUBLISHED',
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
    // Hourly, as FR-12.3 says: it is not a decision on the author's own work,
    // and an author with a busy request heard of every arrival one email at
    // a time until the 2026-10-16 spec review.
    delivery: 'hourly',
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
  SUGGESTION_WITHDRAWN: {
    label: 'A suggestion was withdrawn',
    sentence: 'A helper took back a suggestion you had opened. It no longer waits on you.',
    // FR-6.5 — sent only when an author had opened it, and nothing is lost by
    // hearing within the hour (phase 14, item 1.10).
    delivery: 'hourly',
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
  IDEA_REPLY: {
    label: 'Someone replied to your idea',
    sentence: 'There is an answer under an idea you posted.',
    // A conversation, not a decision on your work: the hour is soon enough
    // (phase 14, item 1.9).
    delivery: 'hourly',
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
  REQUEST_CLOSED: {
    label: 'A passage you were answering was closed',
    sentence:
      'The author closed it, or marked the story finished, made it private or deleted it. Any suggestion you sent stays on your profile.',
    // Immediate: somebody may be mid-draft on it right now, and every hour they
    // spend after this point is an hour spent on something nobody can accept.
    delivery: 'immediate',
    canDisableEmail: true,
  },
  REQUEST_REOPENED: {
    label: 'A passage you answered is open again',
    sentence:
      'The author opened it for help again. A suggestion of yours that was waiting is back in front of them.',
    // Good news, not a deadline: nothing is lost by hearing within the hour.
    delivery: 'hourly',
    canDisableEmail: true,
  },
  REQUEST_AUTO_CLOSED: {
    label: 'A request of yours closed by itself',
    sentence: `A passage you opened for help was open for ${String(REQUEST_OPEN_DAYS)} days, so it closed. Open it again if you still want help.`,
    // D-8 (item 6.15) — not a decision on your work, and the page said the
    // day in advance: the hour is soon enough.
    delivery: 'hourly',
    canDisableEmail: true,
  },
  SPIN_OFF_PUBLISHED: {
    label: 'A spin-off of your story was published',
    sentence: 'A writer published an edition of their own version of your story.',
    // Decision 0044 (item 7b.4) — news, not a decision on your work.
    delivery: 'hourly',
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

/** Where a suggestion stands, as `Suggestion.state` has it. */
export type Standing = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'PASSED' | 'STALE' | 'WITHDRAWN'

/**
 * Phase 14, item 6.9 — what a row can say beyond its type, worked out when it
 * is read (`server/notification-targets.ts`): none of it is stored.
 */
export type Facts = {
  /** Who acted, as `nameOf` puts it: a display name, or "a former member" once erased. Null names nobody. */
  actor?: string | null
  /** The position of the chapter the passage is in, counted from 1. */
  chapter?: number | null
  /** REQUEST_REOPENED — where the recipient's own suggestion on the request stands. */
  standing?: Standing | null
}

/** The two names `nameOf` gives an absent person open a sentence with a capital. */
function opening(actor: string): string {
  return actor === FORMER_MEMBER || actor === FORMER_CONTRIBUTOR
    ? actor.charAt(0).toUpperCase() + actor.slice(1)
    : actor
}

/**
 * How a row reads, given what is known of it (FR-12.1; phase 14, item 6.9).
 * A pass reads as FR-6.10 words it: "Maya went a different way on chapter 4.
 * Your version is still on your profile." Information, not a verdict. The
 * in-app list and every email read from here, so they never disagree; with
 * nothing known, a row reads much as its type's own sentence does.
 */
export function sentenceFor(type: NotificationType, facts: Facts = {}): string {
  const who = (fallback: string) => (facts.actor ? opening(facts.actor) : fallback)
  const on = facts.chapter ? ` on chapter ${String(facts.chapter)}` : ''
  const inChapter = facts.chapter ? ` in chapter ${String(facts.chapter)}` : ''
  switch (type) {
    case 'SUGGESTION_RECEIVED':
      return `${who('Someone')} sent a suggestion for the passage you opened for help${inChapter}.`
    case 'SUGGESTION_ACCEPTED':
      return `${who('An author')} accepted your writing into the main draft${inChapter}.`
    case 'SUGGESTION_PASSED':
      return `${who('An author')} went a different way${on}. Your version is still on your profile.`
    case 'SUGGESTION_STALE':
      return `${who('An author')} accepted another suggestion${inChapter}, so the text changed. Update yours against the new text, or leave it.`
    case 'SUGGESTION_WITHDRAWN':
      return `${who('A helper')} took back a suggestion you had opened${inChapter}. It no longer waits on you.`
    case 'IDEA_RECEIVED':
      return `${who('Someone')} posted an idea on the passage you opened for help${inChapter}.`
    case 'IDEA_MARKED_HELPFUL':
      return `${who('An author')} marked your idea${inChapter} as the one that unstuck them.`
    case 'IDEA_REPLY':
      return `${who('Someone')} replied under an idea you posted${inChapter}.`
    case 'COAUTHOR_INVITED':
      return `${who('An author')} asked you to write with them.`
    case 'COAUTHOR_ACCEPTED':
      return `${who('Someone you invited')} is now a co-author.`
    case 'SPIN_OFF_CREATED':
      return `${who('A writer')} started their own version from yours.`
    case 'CONTRIBUTION_REMOVED':
      return `${who('An author')} restored an earlier version${inChapter}. Your contribution still stands and is still on your profile.`
    case 'REQUEST_QUIET_SEVEN_DAYS':
      return `The passage you opened for help${inChapter} has had no answers for a week.`
    case 'REQUEST_AUTO_CLOSED':
      return `The passage you opened for help${inChapter} was open for ${String(REQUEST_OPEN_DAYS)} days, so it closed. Open it again if you still want help.`
    case 'REQUEST_CLOSED':
      return facts.actor
        ? `${opening(facts.actor)} closed the passage you were answering${inChapter}. Any suggestion you sent stays on your profile.`
        : NOTIFICATIONS.REQUEST_CLOSED.sentence
    case 'REQUEST_REOPENED': {
      const again = `${who('An author')} opened the passage${inChapter} for help again.`
      // And what that means for this reader, by where their own suggestion stands.
      const yours: Record<Standing, string> = {
        SUBMITTED: 'Your suggestion, which was waiting, is back in front of them.',
        DRAFT: 'Yours is a draft again; send it when it is ready.',
        ACCEPTED:
          'The writing of yours they accepted stays in the draft, and what comes next builds on it.',
        PASSED: 'They went a different way on yours before; you can send another.',
        STALE: 'Yours answers an older text; update it, or send another.',
        WITHDRAWN: 'You took yours back; you can send another.',
      }
      return facts.standing ? `${again} ${yours[facts.standing]}` : again
    }
    case 'SPIN_OFF_PUBLISHED':
      return `${who('A writer')} published an edition of their own version of your story.`
    case 'WEEKLY_DIGEST':
      return NOTIFICATIONS.WEEKLY_DIGEST.sentence
  }
}
