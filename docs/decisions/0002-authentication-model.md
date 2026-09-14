# 0002 — Authentication model

Date: 2026-09-12 · Status: accepted

## Context

FR-1.3 orders sign-up as email → verification link → set password → choose
username → pick genres. `02-architecture.md` §3 declares `User.passwordHash`
and `User.username` as required columns, which cannot be true at step one.
FR-1.4 needs a 24-hour expiry and a 60-second resend cooldown on the
verification link. The stack names Auth.js v5 with credentials.

## Decision

1. `User.passwordHash`, `User.username` and `User.displayName` are nullable.
   `User.onboardedAt` marks completion of all four steps. A user with a null
   `passwordHash` cannot sign in; a signed-in user with a null `onboardedAt`
   is routed back to the step they left (Phase 1).
2. Verification links use our own `EmailVerificationToken` table: sha256 of
   the token at rest, `expiresAt`, `consumedAt`, and `createdAt` (which drives
   the resend cooldown). The Auth.js `VerificationToken` model has no creation
   time and is designed for magic-link sign-in, which is not this flow.
3. Sessions are JWTs. The Auth.js database adapter and its `Account` and
   `Session` tables are not installed. The credentials provider does not use
   them, OAuth is explicitly deferred (FR-1.6), and adding the adapter later is
   a migration plus one line.
4. The same link authorises both "confirm email" and "set password". Checking
   the link (`auth.verifyEmail`) does not consume it; setting the password
   (`auth.setPassword`) consumes it, marks the email verified and stores the
   hash in one transaction. After that the client signs in with the new
   credentials.
5. Passwords are hashed with Argon2id at the OWASP minimum (19 MiB, 2
   iterations, 1 lane) via `@node-rs/argon2`, which ships prebuilt binaries for
   every platform Vercel and contributors use. Sign-in verifies a decoy hash
   when the email is unknown so response time does not reveal registered
   addresses. Password rules are length only, 10 to 128 characters.
6. Sign-up and resend never say whether an address is registered.

## Consequences

- One fewer dependency on Auth.js internals; the token table is ours to
  index, expire and rate-limit.
- Phase 6 adds request-level rate limits on `signUp` and `resendVerification`
  (the cooldown alone does not stop enumeration by volume).
- If pen names arrive (OD-2), `displayName` is already separate from
  `username`.
