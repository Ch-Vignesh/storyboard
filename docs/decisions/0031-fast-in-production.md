# 0031 — Fast in production: prefetch on intent, load on use, email after the response

**Date:** 2026-10-13
**Status:** accepted
**Implements:** phase 10, from the first week of real use

## What was measured

Against the live deployment, from India, on 2026-10-13:

- **A warm request:** about 0.27 s. Most of that is the trip to Washington and
  back (Vercel's Mumbai edge, then `iad1`). The server's own work, database
  included, is a few milliseconds.
- **A cold start:** 6.5 s. Every new instance pays it.
- **One view of a storyboard:** about ten server renders at once. The reader
  shows six tab links, plus an edit and a history link for every section, and
  each was prefetched.
- **Sign-up:** the request ran for 53 s before the verification email was
  handed to Gmail, and the email arrived 2–5 minutes later.

## What changed

**Links prefetch on intent, not on sight.** Next prefetches every link that
scrolls into view. For a dynamic route with no `loading.js`, which describes
every page here, that is a full server render per link. `components/link.tsx`
turns that off and prefetches when a pointer rests on a link, a keyboard
focuses it or a finger touches it. That is still ahead of the click, and only
for the link somebody is reaching for. All 43 files that used `next/link` now
use it, and `no-restricted-imports` keeps it that way. Adding a `loading.js`
would not have fixed this: the layouts read the session, so a partial prefetch
still renders on the server.

**Heavy libraries load on first use.** The tRPC route serves every call, and
its routers imported, at the top of the file:

- the AWS SDK, for uploads
- mammoth and an XML parser, for reading manuscripts
- Resend and nodemailer, for mail
- the Argon2 native module, for passwords

So every cold start loaded them, for the rare request that needed one. Each now
loads inside the function that uses it. `@storyboard/import/types` is the
importer's light entry point, so forms and schemas can read its limits without
loading its parsers.

**A database pool sized for a serverless host.** node-postgres defaults to
ten connections per instance and to waiting forever for a free one. Prisma
Postgres's Free plan allows ten connections in total. The pool is now five
per instance. A request that cannot get a connection fails after ten seconds.
An idle connection is kept for a minute, so the next request skips the TLS
handshake. `sslmode=require` is rewritten to the `verify-full` that
node-postgres 8 already applies, which silences its warning on every cold
start.

**The verification email is sent after the response.** `afterResponse` uses
Next's `after`, and Vercel keeps the function alive until the message is
handed over. The form answers at once.

The cost is that a failed send no longer reaches the form. The person sees
"check your inbox" and nothing arrives. It is logged as `mail.failed`, with the
provider's reason and how long the attempt took. The page already offers
another link after a minute, which is the same thing somebody does when an
email is late for any other reason. Outside a request (tests, scripts) the work
runs before returning, so those callers stay deterministic.

**Everything is timed.** Three log events make the next slow page explain
itself instead of being guessed at:

- `instance.start`, once per cold start
- `trpc.slow`, for any call over 500 ms, naming the procedure
- `mail.sent` / `mail.failed`, with the milliseconds and the provider

## What it does not do

It does not move anything closer to the people using it. A warm request from
India still spends most of its time crossing to Washington. That is decision
0032, the move to Singapore.
