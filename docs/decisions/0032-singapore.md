# 0032 — The database and the functions move to Singapore

**Date:** 2026-10-13
**Status:** accepted
**Implements:** phase 10, task 7
**Amends:** 0028, which put the first database in Washington (`iad1`)

## Why

The people using the product are in India, and everything it does was in
Washington. Decision 0031 measured a warm request from India at about 0.27 s,
nearly all of it the trip there and back. Nothing in the code can shorten an
ocean.

Singapore is where a Vercel function region (`sin1`) and a Prisma Postgres
database can sit side by side, nearest to those people. Measured from a laptop
in India on the day of the move, one round trip to each database:

| Database           | Round trip |
| ------------------ | ---------- |
| Washington, before | ~310 ms    |
| Singapore, after   | 60–80 ms   |

The application's own traffic gains less than that, because a function next to
its database pays a millisecond or two per statement either way. What it gains
is the person's own trip to the function.

## How

The database and the function region have to move **together**. A function in
Singapore talking to a database in Washington, or the other way round, crosses
the ocean on every statement. The application gives a transaction five seconds
(decision 0028), and twenty statements at 300 ms each do not fit. So both
change in one deployment: `DATABASE_URL` on Vercel names the new database, and
the function region is `sin1`, before the push that deploys them.

1. A new Prisma Postgres database in Singapore, created by the owner through
   Vercel's storage integration with the prefix `prisma_sin_`. As in 0028, the
   application reads none of the prefixed names.
2. `pnpm db:deploy` on it: all 11 migrations.
3. `pnpm db:copy` from Washington: 405 rows in 24 tables, in one transaction,
   then a checksum of every table on both sides. All identical.
4. `pnpm db:drill` on the copy: all five checks passed, 2026-10-13.
5. The root `.env` names Singapore. Washington's strings stay in it as
   comments.
6. On Vercel, through its API: `DATABASE_URL` (Production) set to Singapore's
   pooled string, and the function region set to `sin1`. Then the push.

The first `instance.start` line after the deploy names its region. That line is
the proof the functions moved; `sin1` is the only right answer.

## Rows written in between

The copy is a moment, and the live site kept serving from Washington until the
deploy. Anything written there after the copy (a sign-up, a cron job's work)
is not in Singapore. The site had no users besides its owner, so the answer
was to not use it in between, and to compare the two databases table by table
once the deploy was live. If they differ, the copy is repeated into a fresh
database rather than patched.

## Washington is kept, for now

The old database stays connected and untouched until Singapore has run cleanly
for a week, and is then disconnected from the Vercel project and deleted in the
Prisma Console. Going back before then is the same two variables in reverse,
with the region set back to `iad1`.

## A check that could not tell two databases apart

The restore drill refuses to run against the live database, and decided
"the same database" by host, port and name. Every Prisma Postgres database is
`db.prisma.io:5432/postgres`; only the login says whose. So it refused the new
database because the old one was in `.env`, and it would have refused any
restore into a second Prisma database, which is the drill phase 11 needs.

`sameDatabase` in `packages/config/env.js` now compares the login as well, and
folds a pooler's host into its direct one (`pooled.db.prisma.io`, Neon's
`-pooler`), so the drill still refuses the live database by either string. The
tests in `env.test.js` cover both directions; four of them fail against the old
comparison.
