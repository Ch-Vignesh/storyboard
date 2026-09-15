# Tasks

Where the build actually is, at a glance. `docs/04-phase-plan.md` is the full
record — every task, every exit criterion, every decision and why. This file is
the short version: what is done, what is being worked on, and what is blocked on
something that is not code.

**Last updated:** 2026-09-15

---

## Now

| What                            | State   | Note                                                                |
| ------------------------------- | ------- | ------------------------------------------------------------------- |
| Marketing page (FR-1.1) rebuild | done    | Seven sections, dark theme, CSS-only example switcher. Uncommitted. |
| Phases 8–10                     | drafted | See `docs/04-phase-plan.md`. Nothing started.                       |

## Blocked, and not on code

These are the only things standing between the product and a launch. Every one
of them needs an account or a decision, not a commit.

| What                                      | Needs                             | Blocks                |
| ----------------------------------------- | --------------------------------- | --------------------- |
| Neon database                             | an account                        | everything deployed   |
| R2 bucket                                 | a Cloudflare account              | manuscript uploads    |
| Two Vercel projects (`app`, `web`)        | an account                        | everything deployed   |
| Six cron entries                          | Vercel Cron, once deployed        | digests, prune, purge |
| Backup restore drill (NFR-8)              | a backup to restore               | phase 7 task 8        |
| Accessibility audit (NFR-4)               | a screen reader and an audit tool | the WCAG claim        |
| Seeded excerpts checked against Gutenberg | an afternoon                      | the traffic post      |
| The name (OD-1)                           | a decision, deliberately deferred | nothing               |

---

## Done

Seven phases, each with its exit criteria verified locally before it was
committed. Commit hashes are in `docs/04-phase-plan.md`.

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

### What the audit found

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
| `scripts`          | The vocabulary linter and its tests                                      |
| `docs`             | The spec, the architecture, the phase plan, and 21 decision records      |

### Where the rules are enforced

| Rule                                       | Where                                         |
| ------------------------------------------ | --------------------------------------------- |
| Who may do what (NFR-6)                    | `apps/app/src/lib/authz` — never in a route   |
| Revisions are immutable (NFR-3)            | A Postgres trigger, with two narrow hatches   |
| One open request per section               | A partial unique index                        |
| One main version per storyboard            | A partial unique index                        |
| The interface never speaks git             | `pnpm check-vocabulary`, in CI                |
| Every mutation refuses a suspended account | `apps/app/src/server/trpc/procedures.test.ts` |

---

## Standing checks

Run before every commit. CI runs the same set.

```
pnpm format:check   pnpm check-vocabulary   pnpm lint
pnpm typecheck      pnpm test               pnpm build
```

Plus, for anything touching the database or a screen:

```
pnpm db:deploy                       # migrations apply with no drift
pnpm --filter @storyboard/app exec playwright test    # 22 flows
```

**Current:** 328 unit and database tests, 22 Playwright flows, all passing.
