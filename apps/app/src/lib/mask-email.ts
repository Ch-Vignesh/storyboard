/**
 * Phase 14, item 3.2 — an address shown in part: the first letter of the
 * local part, then the domain, so a note about a change of address tells its
 * owner which address it went to without handing the whole thing to whoever
 * else reads that mailbox. "v…@example.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '…'
  return `${email.slice(0, 1)}…@${email.slice(at + 1)}`
}
