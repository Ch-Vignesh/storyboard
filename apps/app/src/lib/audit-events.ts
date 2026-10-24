/**
 * Phase 14, item 10.2 (NFR-7) — the events that are stored as well as logged,
 * by the name their log line gives them, and how the admin panel's Events
 * screen says each one after the name of whoever did it. No `server-only`
 * guard: the screen's panel reads the wording, and nothing here touches data.
 *
 * The item's list (accept, pass, restore, spin-off, report, suspend, lift,
 * hide, show, promotion, and an account deletion asked for, cancelled or
 * done), with the rest of what an administrator does, which decision 0043
 * counts among the socially significant events.
 */
export const AUDIT_EVENT_NAMES = [
  'suggestion.accepted',
  'suggestion.passed',
  'section.restore',
  'spinoff.created',
  'version.promoted',
  // Decision 0044 (item 7b.1).
  'storyboard.published',
  'report.created',
  'admin.report_decided',
  'admin.content_hidden',
  'admin.content_shown',
  'admin.user_status',
  'admin.auto_suspended',
  'admin.user_banned',
  'admin.user_unbanned',
  'admin.account_deleted',
  'admin.role_set',
  'admin.grants_set',
  'admin.name_banned',
  'admin.name_unbanned',
  'admin.flag_set',
  'account.deletion_requested',
  'account.deletion_cancelled',
  'purge.account',
] as const

export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number]

/** What an event was done to, in the words of the screen. */
const TARGET_WORDS: Record<string, string> = {
  SUGGESTION: 'a suggestion',
  STORYBOARD: 'a story',
  USER: 'an account',
  IDEA: 'an idea',
}

type Detail = Record<string, unknown> | null

/** What happened, as it reads after the name of whoever did it. */
export function describeAuditEvent(
  event: string,
  targetType: string | null,
  detail: Detail,
): string {
  const thing = TARGET_WORDS[targetType ?? ''] ?? 'something'
  switch (event) {
    case 'suggestion.accepted':
      return 'accepted a suggestion'
    case 'suggestion.passed':
      return 'passed on a suggestion'
    case 'section.restore':
      return 'restored an earlier version of a section'
    case 'spinoff.created':
      return 'spun off the story'
    case 'version.promoted':
      return 'made another version the main draft'
    case 'storyboard.published':
      return typeof detail?.number === 'number'
        ? `published edition ${String(detail.number)}`
        : 'published an edition'
    case 'report.created':
      return `reported ${thing}`
    case 'admin.report_decided':
      return detail?.decision === 'UPHELD'
        ? `upheld a report about ${thing}`
        : detail?.decision === 'DISMISSED'
          ? `dismissed a report about ${thing}`
          : `opened a report about ${thing} again`
    case 'admin.content_hidden':
      return `hid ${thing}`
    case 'admin.content_shown':
      return `showed ${thing} again`
    case 'admin.user_status':
      return detail?.status === 'SUSPENDED' ? 'suspended an account' : 'lifted a suspension'
    case 'admin.auto_suspended':
      return 'upheld a tenth report, which suspended the account'
    case 'admin.user_banned':
      return 'banned an account'
    case 'admin.user_unbanned':
      return 'lifted a ban'
    case 'admin.account_deleted':
      return 'closed an account and set it to be deleted'
    case 'admin.role_set':
      return detail?.role === 'SUB_ADMIN' ? 'made a sub-admin' : 'made a sub-admin a user again'
    case 'admin.grants_set':
      return "set a sub-admin's grants"
    case 'admin.name_banned':
      return 'banned a username'
    case 'admin.name_unbanned':
      return 'lifted the ban on a username'
    case 'admin.flag_set':
      return detail?.enabled === true ? 'switched a flag on' : 'switched a flag off'
    case 'account.deletion_requested':
      return 'asked for their account to be deleted'
    case 'account.deletion_cancelled':
      return 'kept their account'
    case 'purge.account':
      return 'erased the account, its grace period over'
    default:
      return event
  }
}
