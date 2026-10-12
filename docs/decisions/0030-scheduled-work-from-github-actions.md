# 0030 — Scheduled work runs from GitHub Actions, on Vercel's Hobby plan

**Date:** 2026-10-13
**Status:** accepted
**Amends:** decision 0012, which drives `/api/cron/[job]` from `vercel.json`
crons, and the Pro requirement in `05-deployment.md`

## Why

The team's Vercel account is on Hobby. Hobby allows a cron job to run at most
once a day, and a deployment whose `vercel.json` asks for more fails outright.
Vercel's error is "Hobby accounts are limited to daily cron jobs". This product
runs `immediate` every ten minutes and `hourly` every hour, so the application
could not deploy at all.

Pro would fix it for $20 a month. Running the jobs once a day would fix it for
nothing, but a decision on your own work would then reach you up to a day late.
The product owner chose a third way.

## What changed

- `apps/app/vercel.json` has no `crons` any more.
- `.github/workflows/cron.yml` holds the same six schedules and calls the same
  endpoint, `POST /api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`.
  Nothing about the endpoint changed: decision 0012 already made it
  scheduler-agnostic, and this is the first scheduler that is not Vercel.
- The workflow needs a repository secret, `CRON_SECRET`, holding the same value
  as the app's `CRON_SECRET` on Vercel. It also needs a repository variable,
  `APP_URL`. Without `APP_URL` every run is skipped, so a fork does nothing.
- Every job can be run by hand from the Actions tab.

## What it costs

- **Timing.** GitHub starts scheduled runs late when it is busy, usually by
  minutes. "Immediate" means within about ten minutes, plus that delay.
- **Dormancy.** GitHub stops scheduling workflows in a repository that has had
  no commit for 60 days, and says so by email. A quiet stretch of development
  would silently stop the digests until somebody re-enables the workflow.
- **One secret in two places.** Rotating `CRON_SECRET` means changing it on
  Vercel and in GitHub together; between the two, every run answers 401.
- **No retries**, as before (decision 0012). A run that fails waits for the
  next one. Retrying could send mail twice if the failure came partway through.

Minutes are not a cost: the repository is public, and GitHub-hosted runners are
free for public repositories.

## Reversing it

On Pro, put the six entries back under `crons` in `apps/app/vercel.json`, and
delete the workflow or remove the `APP_URL` variable. Vercel sends the same
header from the project's `CRON_SECRET`.
