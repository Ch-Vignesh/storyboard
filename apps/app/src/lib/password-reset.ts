import { PASSWORD_RESET_TTL_MINUTES } from '@/lib/schemas/constants'

/**
 * FR-1.7 — how long a reset link works, as the form and the email both say it.
 * Derived, so the sentence cannot drift from the bound it describes.
 */
export const RESET_LINK_LIFETIME =
  PASSWORD_RESET_TTL_MINUTES === 60 ? 'an hour' : `${String(PASSWORD_RESET_TTL_MINUTES)} minutes`
