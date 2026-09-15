# Tasks

Where the build actually is, at a glance. `docs/04-phase-plan.md` is the full
record — every task, every exit criterion, every decision and why. This file is
the short version: what is done, what is being worked on, and what is blocked on
something that is not code.

**Last updated:** 2026-09-15

---

## Now

| What                        | State                    | Note                                                                   |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Phase 9                     | committed, not pushed    | Deletion, `.epub`, Upstash, the CSP, Google sign-in, the age gate gone |
| Phase 8 — the accounts half | blocked, and not on code | Five accounts. Follow `docs/05-deployment.md` in order                 |
| Promotion page              | done, uncommitted        | Proof-mark clip art, parallax layers, an axe pass over apps/web        |
| Phase 10                    | deliberately unplanned   | Drawn from real use, when there is some                                |

## Blocked, and not on code

These are the only things standing between the product and a launch. Every one
of them needs an account, a DNS record, or a person — not a commit.

| What                                  | Needs                             | Blocks                        |
| ------------------------------------- | --------------------------------- | ----------------------------- |
| Neon database                         | an account                        | everything deployed           |
| R2 bucket **and its CORS rule**       | a Cloudflare account              | manuscript uploads            |
| Two Vercel projects (`app`, `web`)    | an account, on the **Pro** tier   | everything deployed           |
| Resend, and a verified sending domain | an account and DNS                | every email; start this early |
| Running the restore drill for real    | a backup to restore               | the NFR-8 claim               |
| A screen-reader pass                  | an hour and a screen reader       | the WCAG 2.2 AA claim         |
| The 26 flows against production       | a deployment                      | the traffic post              |
| The name (OD-1)                       | a decision, deliberately deferred | nothing                       |

Vercel's Hobby tier allows two scheduled jobs at most once a day. This product
has six, one of them every ten minutes — so Hobby silently drops four of them.

---

## Done

Eight phases. Each had its exit criteria verified locally before it was
committed; commit hashes are in `docs/04-phase-plan.md`.

| Phase                      | What it added                                                                                                                               | State            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0 — Foundations            | Monorepo, Prisma schema, the NFR-3 immutability trigger, Auth.js, tRPC, design tokens, the vocabulary linter, CI                            | pushed, CI green |
| 1 — Write something        | `lib/authz` (the SRS §3.2 matrix, 64 cells tested), onboarding, the restricted document model, editor, history, restore, the reader         | pushed           |
| 2 — The loop               | `packages/compare`, requests, suggestions, accept, stale and rebase, pass, ideas, credits, notifications                                    | pushed           |
| 3 — Findable and durable   | Browse and search, profiles, credit lines, email digests, cron endpoints                                                                    | pushed           |
| 4 — Versions and spin-offs | Alternate drafts, comparison of two versions, spin-offs with inherited credits, the lineage banner, OD-3's erasure                          | pushed           |
| 5 — Import and export      | `packages/import` (six formats, the seven-strategy cascade, the boundary review screen) and `packages/export` (.docx, .md, .pdf, .fountain) | pushed           |
| 6 — Trust                  | Quota tiers, a Postgres sliding-window rate limiter, reporting, the admin queue, feature flags, the purge job                               | pushed           |
| Audit after 6              | A read of the whole codebase: six real bugs found and fixed, each with a test that fails without the fix                                    | pushed           |
| 7 — Launch                 | 25 seeded public-domain works with 56 hand-written stuck points, the marketing page, the age policy, the community rules                    | pushed           |
| Marketing page             | Seven sections, dark theme, a CSS-only example switcher, scroll-linked motion with no libraries                                             | committed        |
| 8 — Into the world         | Everything below, plus phases 9–10 drafted                                                                                                  | pushed           |
| 9 — The gaps we left       | Account deletion, `.epub`, Upstash, a Content-Security-Policy, Google sign-in, and the age gate removed                                     | uncommitted      |

### What phase 8 found

The phase predicted it would need no code — it is account work. Five things
disagreed, and every one of them was invisible until the repository was pointed
at the internet and looked at.

1. **The build would have failed on Vercel.** Turborepo runs in `strict` env
   mode and three variables were not declared in `globalEnv`, so they would have
   been filtered out of the build. Locally this is invisible, because
   `next.config.ts` loads the root `.env` itself and there is no such file on a
   host. Separately, an undeclared `NEXT_PUBLIC_*` means changing a public URL
   does not invalidate the build cache — which is how a deployment serves an old
   URL baked into the browser bundle.
2. **A misconfigured deployment started happily.** No mail key: every
   verification link goes to stdout and every new account is stranded, with
   healthy-looking logs. No cron secret: no digest ever runs. No object store on
   a serverless host: uploads land on a machine that goes away. Decision 0022.
3. **Thirteen of forty-five seeded quotations were wrong**, including a citation
   pointing at the wrong book. And fixing the file was not enough — the seeder
   was idempotent by existence, so no correction could ever reach a database
   that had been seeded once. Decision 0023.
4. **Two systemic accessibility failures.** The faintest ink was 2.98:1 on
   paper, failing WCAG 1.4.3 on every timestamp and byline in the product; and
   every link inside a run of text was distinguished from that text by colour
   alone, because the base style set `no-underline` and components added
   `hover:underline`, which does nothing for somebody who is not hovering.
5. **No 404 page** — on a product where unpublished work deliberately answers
   404 rather than 403, so it is the front door of every private draft rather
   than a page people reach by accident.

### What the audit after phase 6 found

Worth keeping visible, because two of the six had shipped in the phase before
and neither would have been found by building the next feature.

1. The purge job never ran at all — it asked the NFR-3 trigger for an UPDATE it
   refuses, caught its own error, and reported a quiet day.
2. Purging a storyboard would have silently emptied every spin-off of it, thirty
   days after an unrelated person pressed delete (decision 0019).
3. A suspended account could still write through nineteen mutations that never
   load a storyboard, so never reach `can()`.
4. The sign-in page threw away where the visitor was trying to go.
5. Two rate limits counted refusals rather than actions.
6. One piece of dead code carried a weaker guard than its live siblings.

---

## Modules

What each part of the repository is for, and where to look first.

| Module             | What it owns                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `apps/app`         | The application. Routes in `src/app`, API in `src/server/trpc/routers`   |
| `apps/web`         | The marketing site. One page, deliberately separate from the application |
| `packages/db`      | Prisma schema, migrations, seeds. The invariants live in migration SQL   |
| `packages/ui`      | Design tokens as a Tailwind v4 theme, and the shadcn-style components    |
| `packages/compare` | The comparison engine: two pieces of prose in, what changed out          |
| `packages/import`  | Six file formats in, one `NormalisedDoc` out, plus the chapter cascade   |
| `packages/export`  | One `Manuscript` in, `.docx` / `.md` / `.pdf` / `.fountain` out          |
| `packages/config`  | tsconfig presets, ESLint configs, the root `.env` loader                 |
| `scripts`          | The vocabulary linter, the excerpt checker, and their tests              |
| `docs`             | The spec, architecture, phase plan, deployment runbook, 23 decisions     |

### Where the rules are enforced

| Rule                                       | Where                                         |
| ------------------------------------------ | --------------------------------------------- |
| Who may do what (NFR-6)                    | `apps/app/src/lib/authz` — never in a route   |
| Revisions are immutable (NFR-3)            | A Postgres trigger, with two narrow hatches   |
| One open request per section               | A partial unique index                        |
| One main version per storyboard            | A partial unique index                        |
| The interface never speaks git             | `pnpm check-vocabulary`, in CI                |
| Every mutation refuses a suspended account | `apps/app/src/server/trpc/procedures.test.ts` |
| A public deployment is fully configured    | `apps/app/src/env-preflight.ts`, at startup   |
| Seeded quotations match their editions     | `pnpm check-excerpts`, monthly and on change  |
| What a signed-out person may see           | One filter, reused by browse and the sitemap  |

---

## Standing checks

Run before every commit. CI runs the same set.

```
pnpm format:check   pnpm check-vocabulary   pnpm lint
pnpm typecheck      pnpm test               pnpm build
```

Plus, for anything touching the database or a screen:

```
pnpm db:deploy                                        # migrations apply with no drift
pnpm --filter @storyboard/app exec playwright test    # 26 flows
```

And the two that are not on every commit:

```
pnpm check-excerpts          # after editing the seed library. Hits the network
pnpm db:drill "<url>"        # against a restored backup, before launch and quarterly
```

**Current:** 423 unit and database tests, 33 Playwright flows (24 journeys, 5
CSP checks and 4 accessibility scans), all passing.
