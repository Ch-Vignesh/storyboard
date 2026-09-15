# 0017 — Rate limits live in Postgres until there is a Redis to move them to

**Date:** 2026-09-15
**Status:** accepted
**Deviates from:** `03-build-plan.md` phase 6, which names Upstash sliding windows

## The decision

FR-13.3's limits are counted in Postgres, behind an interface that a Redis
driver can be dropped into later. `@upstash/ratelimit` is not installed.

## Why

Two reasons, one practical and one about honesty.

**There is no Upstash account to test against.** Writing a Redis driver that has
never connected to a Redis and then marking the task done would be claiming
something untrue in `04-phase-plan.md`. A limiter that has never rejected a
real request is not a limiter; it is a hope.

**Postgres is exact, and the scale does not need more.** A sliding window over
a `RateLimitHit` table is one indexed count per check. At the volumes FR-13.3
describes — ten suggestions a day, five storyboards a day — the table stays
small, and old rows are pruned by the same cron runner that sends the digests
(decision 0012). Redis would be faster per check; nothing here is waiting on
those microseconds.

## What this costs

A count against Postgres on every limited action, and rows that have to be
pruned. Both are real and both are small. The cost that matters is _serialisable
correctness under concurrency_: two requests arriving together could each see
nine hits and both be allowed. The window is a day and the limit is ten, so the
worst case is eleven — which is not the kind of wrong that matters here, and is
the same behaviour Redis's sliding window gives for the same reason.

If it ever does matter, the fix is a unique constraint per (key, sequence) or a
`SELECT … FOR UPDATE`, not a different database.

## What was also considered

- **Installing Upstash and leaving it unconfigured.** Rejected: the code path
  would be dead, untested, and indistinguishable from working until launch day.
- **Counting the domain rows directly**, as phases 1 to 5 do (`storyboard.count`
  where `createdAt > yesterday`). That is what the existing limits do and it is
  exact, but it does not work for sign-up or for verification resends, where the
  thing being limited leaves no row behind — and having two mechanisms for one
  requirement is how one of them rots.

## When to revisit

When there is an Upstash account, or when a limit check shows up in a slow
query log. The interface is `consume(key, limit, windowMs)`; a Redis driver is
one file.

Related: [[0012-cron-endpoints-before-inngest]], which made the same call about
scheduled work for the same reason.

---

## Revisited in phase 9

The Redis driver exists now: `apps/app/src/server/limits/redis.ts`, an Upstash
sliding window over a sorted set, reached through `fetch` rather than a client
library — their REST API is a POST with a JSON array, and there is no connection
to pool, which is the property that made it worth having from serverless.

The claim this record made held up exactly: _"the interface here is the one a
Redis driver would implement, so moving is one file when there is something to
move to."_ It was one file, plus a `types.ts` so the driver and the dispatcher
could share `Limit` and `Verdict` without importing each other.

**Postgres is still the default**, and this record's revisit trigger is
unchanged: set the two Upstash variables when a limit check shows up in a slow
query log, and not before. Nothing is deployed yet, so there is no slow query
log to look at.

Two things worth knowing about the dispatcher. Configuration chooses the store,
never `NODE_ENV` — the same reasoning as the storage driver. And when Redis
fails, `consume` falls back to Postgres rather than allowing the action: a
limiter that opens the gate when its store is unreachable is not a limiter,
which was this record's original complaint in the first place.
