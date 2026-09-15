# 0022 — A public deployment refuses to start half-configured

**Date:** 2026-09-15
**Status:** accepted
**Implements:** the note at the end of phase 8 in `04-phase-plan.md` — "nothing
in this phase should require a code change; if it does, that is a finding worth
writing down"

## The finding

Phase 8 is configuration, so the plan said it should need no code. It needed
some, and the reason is worth recording because it is a category of bug rather
than a bug.

Three variables are optional in `env.ts`, correctly: `RESEND_API_KEY`,
`CRON_SECRET`, and the four `R2_*`. A clone of this repository has to run
without a Cloudflare account, without a mail provider, and without a scheduler.
That is a real requirement and none of it should change.

But every one of those falls back to something that is right on a laptop and
silently wrong on the internet:

| Missing          | What it does instead                   | What it looks like                          |
| ---------------- | -------------------------------------- | ------------------------------------------- |
| `RESEND_API_KEY` | Prints every message to stdout         | Sign-up works. Nobody ever gets the link    |
| `CRON_SECRET`    | Every scheduled job answers 503        | Healthy logs. No digest ever arrives        |
| `R2_*`           | Writes uploads to the local filesystem | Imports work, then fail on another instance |

None of them raises an error. Each looks like a working deployment from the
outside, and the first person to notice is a user who cannot finish signing up.

## The decision

`apps/app/src/env-preflight.ts` runs at startup, after the schema check. When a
deployment is publicly reachable it requires the mail key, a sender that is not
the placeholder, a cron secret, https URLs, and object storage on a serverless
host. It reports every problem at once and names the variable.

`ALLOW_INCOMPLETE_DEPLOYMENT=1` downgrades all of it to warnings.

## Why the public URL is the trigger, and not `NODE_ENV`

This is the part that took the thinking.

`NODE_ENV=production` is true for `next build`, for `next start` on a laptop,
and for the Playwright suite — which runs against a production build with
`RESEND_API_KEY` deliberately empty so the console mailer can hand the flows
their verification links. Keying the check to `NODE_ENV` would have broken all
twenty-two flows, and the obvious repair — an exception for tests — is how a
check ends up not running anywhere that matters.

What actually distinguishes a deployment is that strangers can reach it. The
variable that says so is `NEXT_PUBLIC_APP_URL`. A loopback host is somebody
developing; anything else is the internet.

This also matches how `server/storage` already chooses its driver: by
configuration, not by a guess about the environment. A self-hosted box is a
supported way to run this and should not have to lie about `NODE_ENV` to get
the same treatment as Vercel.

## Why R2 is a refusal on serverless and a warning elsewhere

The local upload driver is a feature, not a fallback: a self-hosted deployment
with a persistent disk runs on it correctly. On a serverless host it is not a
degraded mode, it is a bug with a delay — each instance has its own temporary
filesystem, so an import fails whenever the parse lands somewhere other than
the upload. So the check asks `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` and refuses
only there. Everywhere else it says what it is doing and starts.

## What this does not do

It does not check that the values _work_. A wrong Resend key, a bucket that
does not exist, a database that refuses the connection — all of those start
cleanly and fail later. Checking them would mean network calls at boot, which
trades a silent misconfiguration for a deployment that cannot start when a
third party is briefly down. The preflight answers "is this configured", and
the first real deploy answers "is it right".

## Consequences

- One more file to keep in step with `env.ts`, and a test file that pins the
  reasoning above so a later edit cannot quietly reintroduce `NODE_ENV`.
- `docs/05-deployment.md` is now the place the error message points at, so it
  has to stay true.
