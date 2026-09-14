import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'))

/** Length over composition rules; a passphrase is fine. */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')

/** What the sign-in form posts. Deliberately loose: never hint at the real rules. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
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
])

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters.')
  .max(30, 'Use at most 30 characters.')
  .regex(USERNAME_PATTERN, 'Lowercase letters, numbers and hyphens only.')
  .refine((value) => !RESERVED_USERNAMES.has(value), 'That name is reserved.')
