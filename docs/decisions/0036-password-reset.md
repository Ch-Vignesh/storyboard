# 0036 — Password reset, and what it does to the sessions already open

**Date:** 2026-10-15
**Status:** accepted
**Implements:** FR-1.7, added to the SRS the same day at the owner's request
**Amends:** 0002, whose JWT sessions could not be ended from the server

## Why

The SRS never asked for a way back in after a forgotten password, and the
product had none. Anybody who forgot theirs was locked out for good. The owner
found it on the first real use.

## The flow

1. **Sign-in → "Forgot your password?" → an address.** The screen says the same
   whatever the address is, in the same one-minute rhythm as sign-up, so it
   cannot be used to find out who has an account. An account gets a reset link.
   An address that never finished signing up gets its confirmation link instead,
   because it has no password to reset. Any other address gets nothing.
2. **The link** works once and for an hour (`PASSWORD_RESET_TTL_MINUTES`), not
   the day a sign-up link has: it changes the password of an account that
   already exists, so it should not sit in an inbox. Reset tokens have a table
   of their own, `PasswordResetToken`, so a link sent to confirm an address can
   never change a password.
3. **The new password, typed twice.** The two are compared in the browser and
   again on the server. The link is claimed inside the transaction by a
   conditional update, so two submissions of one link cannot both change the
   password. Every other link still open for the account is closed with it.
4. **Signed out everywhere, then signed in again.** The person lands on the
   sign-in screen, told the password changed. The address gets an email saying
   so, which matters only when it was not them.

## Ending the sessions already open

Sessions are JWTs in a cookie (decision 0002). The server keeps no list of
them, so it cannot end one by deleting it. Instead the account records
`passwordChangedAt`, and each session records when it signed in. Any session
that signed in before the last reset is refused.

**The sign-in time is a claim of our own, `authAt`, not the token's `iat`.**
Auth.js rewrites the token as it is used and sets a fresh `iat` each time, so
`iat` says when the cookie was last written, not when anybody proved who they
were. The edge proxy rewrites tokens too, without reading the database, so a
check on `iat` could be undone by the proxy refreshing a session the server
should have ended. A claim we set at sign-in is copied unchanged through every
rewrite.

**The check is in the server half of the `jwt` callback.** Every read of a
session on the server passes through it, including the export and upload
routes that do not go through tRPC, and returning `null` makes Auth.js treat
the session as signed out and clear its cookie. It costs one lookup by primary
key per session read, next to the database in the same region.

**The edge proxy cannot see it**, because it never reads the database. A
refused session still gets through the proxy to a protected page. The app
layout catches it: a session cookie the server has refused redirects to
sign-in, and the browser's own session check clears the cookie a moment later.
The page's data prefetch has already started by then and is refused, and Next
logs that as `Error: redacted`. One such line each time a signed-out device
opens a protected page is the known cost. The person never sees it.

A token from before `authAt` existed counts as signed in at the beginning of
time, so it is refused only on an account that has been reset since. Nobody
was signed out by this change shipping.

## Deploying it

The migration is additive, one nullable column and one table, and it must be
applied before the code. The code reads `passwordChangedAt` on every
signed-in request, so code without its column breaks every signed-in page.
`05-deployment.md` now says this for every migration.
