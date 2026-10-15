import { z } from 'zod'

import { PASSWORD_CHARS, USERNAME_CHARS } from './constants'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'))

/** Length over composition rules; a passphrase is fine. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_CHARS.min, `Use at least ${String(PASSWORD_CHARS.min)} characters.`)
  .max(PASSWORD_CHARS.max, `Use at most ${String(PASSWORD_CHARS.max)} characters.`)

/** What the sign-in form posts. Deliberately loose: never hint at the real rules. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_CHARS.max),
})

/**
 * FR-1.3: chosen once, shown in credit lines forever. Lowercase letters,
 * digits and hyphens; 3 to 30 characters; cannot start or end with a hyphen.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'browse',
  'draftboard',
  'help',
  'import',
  'me',
  'root',
  'settings',
  'signin',
  'signup',
  'storyboard',
  'support',
  'system',
  'verify',
  // The seed's own accounts (packages/db/prisma/seed), and the platform
  // account's name before the rename. A person who took one of these would
  // make every later seed run fail on it, or wear the name that signs the
  // example library (phase 12 audit).
  'draftboard-examples',
  'storyboard-examples',
  'example-helper-1',
  'example-helper-2',
])

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_CHARS.min, `Use at least ${String(USERNAME_CHARS.min)} characters.`)
  .max(USERNAME_CHARS.max, `Use at most ${String(USERNAME_CHARS.max)} characters.`)
  .regex(USERNAME_PATTERN, 'Lowercase letters, numbers and hyphens only.')
  .refine((value) => !RESERVED_USERNAMES.has(value), 'That name is reserved.')
