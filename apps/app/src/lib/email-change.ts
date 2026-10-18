import { EMAIL_CHANGE_TTL_MINUTES } from '@/lib/schemas/constants'

/**
 * Item 3.2 — how long a change-of-address link works, as the page and the
 * email both say it. Derived, so the sentence cannot drift from the bound.
 */
export const EMAIL_CHANGE_LINK_LIFETIME =
  EMAIL_CHANGE_TTL_MINUTES === 60 ? 'an hour' : `${String(EMAIL_CHANGE_TTL_MINUTES)} minutes`
