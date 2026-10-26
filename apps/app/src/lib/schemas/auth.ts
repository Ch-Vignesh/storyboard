import { z } from 'zod'

import { EMAIL_MAX_CHARS, PASSWORD_CHARS, USERNAME_CHARS } from './constants'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_CHARS, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'))

/**
 * D-17 (phase 14, item 3.9), an addendum to decision 0002 — the owner's rule:
 * at least `PASSWORD_CHARS.min` characters, with a lower-case letter, a
 * capital, a digit and a symbol. No list of common passwords. The forms show
 * these as a checklist that ticks as the person types; the server's refusal
 * names the first one missing. Spaces are welcome, and are not symbols.
 */
export const PASSWORD_RULES = [
  {
    key: 'length',
    label: `At least ${String(PASSWORD_CHARS.min)} characters`,
    missing: `Use at least ${String(PASSWORD_CHARS.min)} characters.`,
    met: (value: string) => value.length >= PASSWORD_CHARS.min,
  },
  {
    key: 'lower',
    label: 'A lower-case letter',
    missing: 'Add a lower-case letter.',
    met: (value: string) => /\p{Ll}/u.test(value),
  },
  {
    key: 'upper',
    label: 'A capital letter',
    missing: 'Add a capital letter.',
    met: (value: string) => /\p{Lu}/u.test(value),
  },
  {
    key: 'digit',
    label: 'A number',
    missing: 'Add a number.',
    met: (value: string) => /\p{Nd}/u.test(value),
  },
  {
    key: 'symbol',
    label: 'A symbol, like ! or ?',
    missing: 'Add a symbol, like ! or ?.',
    met: (value: string) => /[^\p{L}\p{N}\s]/u.test(value),
  },
] as const

/** The first rule a password misses, in the words the person is told, or null. */
export function passwordShortfall(value: string): string | null {
  return PASSWORD_RULES.find((rule) => !rule.met(value))?.missing ?? null
}

export const passwordSchema = z
  .string()
  .max(PASSWORD_CHARS.max, `Use at most ${String(PASSWORD_CHARS.max)} characters.`)
  .superRefine((value, ctx) => {
    const shortfall = passwordShortfall(value)
    if (shortfall) ctx.addIssue({ code: 'custom', message: shortfall })
  })

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
  // Item 3.7 — names that would pose as the place or its staff, names that
  // would read as nobody, and every top-level route, so a profile address can
  // never shadow a page.
  'moderator',
  'mod',
  'staff',
  'security',
  'official',
  'team',
  'null',
  'undefined',
  'everyone',
  'anonymous',
  'former-member',
  'former-contributor',
  'about',
  'contact',
  'privacy',
  'terms',
  'rules',
  'new',
  'notifications',
  'suggestions',
  'invitations',
  'onboarding',
  'unsubscribe',
  'forgot-password',
  'reset-password',
  's',
  'u',
  // Top-level routes added since item 3.7: the public record (item 8.12) and
  // the files the framework serves at the root (2026-10-26 final pass).
  'proof',
  'opengraph-image',
  'apple-icon',
  'icon',
  'manifest',
  'sitemap',
  'robots',
  // The seed's own accounts (packages/db/prisma/seed), and the platform
  // account's name before the rename. A person who took one of these would
  // make every later seed run fail on it, or wear the name that signs the
  // example library (phase 12 audit).
  'draftboard-examples',
  'storyboard-examples',
  'example-helper-1',
  'example-helper-2',
])

/** Item 3.8 — a display name may not pose as one of these either. */
export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(value.trim().toLowerCase())
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_CHARS.min, `Use at least ${String(USERNAME_CHARS.min)} characters.`)
  .max(USERNAME_CHARS.max, `Use at most ${String(USERNAME_CHARS.max)} characters.`)
  .regex(USERNAME_PATTERN, 'Lowercase letters, numbers and hyphens only.')
  .refine((value) => !RESERVED_USERNAMES.has(value), 'That name is reserved.')
