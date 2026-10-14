# 0034 — Production is proven by safe tests and one walk-through, not the flows

**Date:** 2026-10-14
**Status:** accepted
**Implements:** phase 11, task 4
**Amends:** phase 11's exit criterion "the flows green against production", and
`05-deployment.md` section 7, which told you to run them there

## Why

The flows cannot pass against a deployment, and trying is not harmless.

- **Sign-up.** Most flows start by signing up. A flow reads its verification
  link from `MAIL_LOG_FILE`, which only a local server writes. Against a
  deployment, every sign-up sends a real email through the real mail provider
  to an `@storyboard.invalid` address, which bounces back to the sending
  account, and then the flow waits for a link that never comes. About two dozen
  sign-ups per run, as many bounces, a sender reputation spent on nothing.
- **Direct writes.** Some flows write to the database themselves. The reader
  test builds a 120,000-word story through Prisma. That client uses
  `DATABASE_URL`, and on the owner's laptop `.env` names production.

Making them work was weighed, and is available later if it earns its cost:
sign-ups to plus-addresses of the sending Gmail account, links read back over
IMAP, and a script that removes everything a run made. That is a day of work, a
few dozen real emails and rows per run, and a script that deletes production
rows on purpose. A staging copy with its own database would avoid the
deletions and still need the rest.

## What proves production instead

**Tests that cannot write, tagged `@deployed`.** With `PLAYWRIGHT_BASE_URL`
set, `playwright.config.ts` runs those and nothing else. There are seven: axe
on every public page, the reader and an open request; a nonce in the policy
header and in the markup; no policy violation on any public page; and scripts
that actually run. Tagging a test `@deployed` is a claim that it visits pages
and writes nothing, and the configuration comment says so.

**`pnpm check-deploy`**, which uses every credential: the database, a round
trip through the bucket, the CORS rule by preflight, the backup bucket kept out
of the application key's reach, and a mail login.

**One walk-through by the owner**: a real sign-up with a real inbox, and one
manuscript imported. It is the only browser upload that goes to the bucket, and
the sign-up is phase 10's last measurement.

**Everything else** is what CI already runs on every push: all the flows,
against a fresh build of the same commit and a real Postgres.

## What is given up

A production regression that only shows up in a signed-in path, and that
neither CI's build nor the walk-through exercises, would be found by a person
rather than a test. For a product whose users can be counted on one hand, that
is a person who will say so. Revisit when it is not.
