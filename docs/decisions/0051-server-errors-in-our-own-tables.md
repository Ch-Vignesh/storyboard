# 0051 — Server errors are kept in our own tables

**Date:** 2026-10-24
**Status:** accepted (D-10, owner 2026-10-18); built by phase 14, item 10.1
**Amends:** NFR-7, which asks for structured logs and nothing that keeps or
announces a fault; `02-architecture.md`, which names no error tracking

## Why

Until item 10.1 the server's errors went to stdout (`lib/logger.ts`), the host
kept them briefly, and nobody was told. A page that threw for every reader of
one story, or a procedure that failed for everybody after a deployment, was
found when somebody wrote in, or not at all.

D-10 asked whether to send errors to a third-party service or keep them
ourselves. A service is one more account, one more key in the deployment, a
script or an SDK in the server bundle, and one more processor for the privacy
policy to name, with request data leaving for it. The owner's answer: our own
tables, and email is enough for now.

## Decision

- **A `ServerError` table** (migration `20261024200000_server_errors`). A row
  keeps when; where, as a source (`trpc`, `cron`, or Next's own `render`,
  `route`, `action`, `proxy`) and a location (the procedure, the job, or the
  route as written, `/s/[slug]`, never an address with its values); the
  error's name with its code; its message's first and last lines, with
  addresses taken out and long quotations elided, cut to fit; the top frames of
  its stack; and a fingerprint, a hash of where, the name and the message with
  every value taken out, so the same fault is one kind however often it
  happens. Never the request, its body or its headers, and never who was
  asking: a library's message can carry what somebody wrote, and Prisma prints
  the arguments of a failed call between the two lines that are kept.
- **Three writers, internal errors only.** `onRequestError` in
  `instrumentation.ts` (pages, route handlers, server actions, the proxy;
  Next has already set `notFound()` and `redirect()` aside); the tRPC route's
  `onError`, for `INTERNAL_SERVER_ERROR` only, keeping the error the library
  threw rather than the wrapper; and the cron route, when a job throws. The
  row is written after the response has gone. Writing it never throws: if it
  fails, the failure is logged and that is all. One instance writes a kind at
  most `SERVER_ERRORS.perKindPerMinute` times a minute, so a fault in a loop
  cannot fill the table.
- **An Errors screen** in the admin panel, a line per kind, the most recent
  first: how often, first and last seen, whether it has been announced, and the
  newest stack behind a disclosure. Behind `errors.read`, the capability
  decision 0043 set aside for it: the admin has it, and may grant it to a
  sub-admin. To anyone else the screen is a 404, as every admin screen is.
- **The hourly email.** The hourly job emails everyone who may read the error
  log when a kind appears that no email has named, then stamps its rows
  (`alertedAt`), so a kind is announced once. At most one email in each
  `SERVER_ERRORS.alertEveryMinutes`, counted in windows that start on the
  hour, whatever starts the job. If nobody may read the log, or every send
  fails, nothing is stamped and the next run tries again.
- **Kept for `SERVER_ERRORS.retentionDays`** (30), then dropped by the daily
  prune. A kind still happening after its announced rows are pruned is
  announced again.

## Consequences

- A new kind of fault reaches the administrator's inbox within about an hour
  of the next hourly run, which GitHub may start late (decision 0030).
- When the database itself is down, nothing can be written, and the email
  cannot be built either. The host's logs stay the record of that, and the
  scheduled jobs fail visibly: GitHub emails a failed scheduled run to whoever
  last changed that workflow's schedule (`05-deployment.md`, section 5).
- Errors in the browser are not kept; nor are rates or spikes of a known kind,
  only its count. Either can be built on this table if they are ever wanted.
- No new environment variable, account or processor.
