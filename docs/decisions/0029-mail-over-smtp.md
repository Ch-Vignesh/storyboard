# 0029 — Mail over SMTP, starting with Gmail

**Date:** 2026-10-13
**Status:** accepted
**Deviates from:** `02-architecture.md` §1, which names Resend for email, and
step 3 of `05-deployment.md`

## What changed

There is a third mailer beside Resend and the console: SMTP, through
nodemailer. Which one runs is still decided by configuration alone:

1. `RESEND_API_KEY` set → Resend, as before.
2. `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` all set → SMTP.
3. Neither → the console mailer, which prints each message to the log.

Resend is not removed. The product's mail is the same `{ to, subject, text,
html }` either way, so the templates and every caller are untouched.

## Why

Resend needs a verified sending domain before it will deliver to anyone but
the account holder, and there is no domain yet. The product owner does have a
Gmail account for the product, `alerts.draftboard@gmail.com`, with an app
password. That sends today, with no DNS to wait on. It was checked end to end
on 2026-10-13: `pnpm check-deploy --email` sent through `smtp.gmail.com:465`
and Gmail accepted the message.

## What Gmail costs

Gmail is a mailbox, not a sending service, and it shows:

- **Volume.** A personal account sends to roughly 500 recipients a day. That is
  the commonly cited figure, not a contract. Past it, Google blocks sending for
  up to a day. Sign-up links are one message per person, but the weekly digest
  is one per member. When the member count approaches the cap, move to Resend
  with a domain: that is two variables, not code.
- **The sender is the account.** Gmail sends as the address that logged in,
  whatever `EMAIL_FROM` says. The preflight warns when the two differ, and
  `.env` sets them to the same address.
- **One account's standing is the product's mail.** If Google flags or locks
  the account, every message stops, sign-up included. Revoking the app password
  or changing the account password stops it too, silently. `pnpm check-deploy`
  logs in without sending, so it catches that before a user does.

## How it is built

- `server/mail/smtp.ts` holds the transport and imports neither `@/env` nor
  the logger. `pnpm check-deploy` therefore sends its test message through
  exactly the code production uses, not a second copy of it.
- **TLS.** Port 465 is TLS from the first byte. Any other port must upgrade
  with STARTTLS (`requireTLS`), so a server that declines the upgrade, or
  anything in between that strips it, never sees the password.
- **Timeouts.** A sign-up waits on its verification email, so the connection
  gives up in seconds, not the library's minutes (`SMTP_TIMEOUTS_MS`).
- **Half a configuration is an error.** Two of the three variables throw on
  the first send rather than falling back to the console. The fallback would
  look healthy while every sign-up stranded. A public deployment refuses to
  start without one complete provider (decision 0022).
- **Nothing automated sends real mail.** The Vitest config blanks every
  provider, and so does the Playwright server, whose sign-up flows read their
  link from the console mailer.
- **Version.** nodemailer is pinned at 8.0.11. Auth.js declares an optional
  peer range of `^7 || ^8`, and a version inside it keeps that honest even
  though its email provider is not used here.

## Not yet verified

Sending from a Vercel function rather than a laptop. The first deployment
should sign up an address you can read, to confirm the link arrives.
