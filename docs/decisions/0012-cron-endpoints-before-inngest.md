# 0012 — Scheduled email runs on cron endpoints, not Inngest, in v1

Date: 2026-09-14 · Status: accepted

## Context

`02-architecture.md` section 1 lists Inngest for jobs — digests, exports and
hash stamping — and `.env.example` already reserves `INNGEST_EVENT_KEY` and
`INNGEST_SIGNING_KEY` for phase 3.

What phase 3 actually needs is four things (FR-12.3, FR-12.4): an immediate
email when a decision lands on your own work, an hourly digest of everything
else, a weekly digest on Sunday, and a nudge to an author whose request has been
quiet for seven days. Three of those are a clock and a query. One is an event.

Inngest would give durable execution and automatic retries. It also adds a
second process to run before digests can be seen working locally, and an account
and two keys before anything can be deployed — on a project whose whole
development happens on one machine that has no Docker.

## Decision

Build the email layer as ordinary functions, and schedule it with authenticated
HTTP endpoints:

- `server/mail/digests.ts` holds the work: `sendImmediate`, `runHourlyDigest`,
  `runWeeklyDigest`, `runQuietNudge`. No scheduler, no transport, no framework —
  they take a database client and a clock.
- `/api/cron/[job]` calls them, and requires `CRON_SECRET`. On Vercel this is
  driven by `vercel.json` crons; locally it is `pnpm cron <job>`.

Inngest is not ruled out; it is deferred to the point where its durability is
worth its cost. Because the work lives in plain functions, adopting it later
means writing a caller, not rewriting the digests.

## Consequences

- The prototype runs with `pnpm dev` and nothing else. Digests can be exercised
  on demand with `pnpm cron hourly`, which is also how the tests drive them.
- **No automatic retries.** A digest run that fails is lost until the next one.
  This is the real cost, and it is mitigated rather than solved: every send is
  recorded on the notification row (`emailedAt`), so a failed run leaves rows
  unsent and the following run picks them up. The hourly digest is therefore
  self-healing within an hour; the weekly one is not, and would need a manual
  re-run.
- The endpoint is a public URL, so it is only as safe as `CRON_SECRET`. It
  compares in constant time and refuses in every environment where the variable
  is unset.
- If exports (phase 5) or proof-of-authorship stamping (FR-13.6) turn out to
  need long-running or resumable work, that is the moment to revisit — those are
  the cases Inngest is genuinely better at, and neither exists yet.
