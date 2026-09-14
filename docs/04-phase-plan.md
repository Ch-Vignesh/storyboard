# Storyboard — phase plan and progress tracker

Living document. `03-build-plan.md` is the original plan and stays as written;
this file is where the plan meets reality. Update it in the same pull request
as the work it describes.

## How to use this file

- Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked (say by what).
- Tick a task when it is merged, and add the date. If you skip or defer something, say why under **Notes**.
- Do not start a phase until every exit criterion of the previous phase is `[x]`. Run the criteria yourself; do not ask whether they pass.
- Every task names the requirement it satisfies, so `01-srs.md` stays the source of truth. If a task has no requirement, question the task.
- "Where are we?" is always answered by **Current position**.

## Current position

|                  |                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase**        | 0 — Foundations                                                                                                                                                                                                                                                    |
| **State**        | Complete and verified locally against a real Postgres 16. One criterion (green CI) waits on the first push.                                                                                                                                                        |
| **Last updated** | 2026-09-12                                                                                                                                                                                                                                                         |
| **Next actions** | 1. Create the GitHub repository, push `main`, confirm the CI workflow is green. 2. Set up hosting accounts (see the checklist at the end); at minimum Neon, so `DATABASE_URL` exists outside this machine. 3. Decide OD-4. 4. Begin Phase 1, task 1 (`lib/authz`). |

## Overview

| Phase | Name                   | Requirements                                                                          | Estimate  | Status                                        |
| ----- | ---------------------- | ------------------------------------------------------------------------------------- | --------- | --------------------------------------------- |
| 0     | Foundations            | FR-1.3 (steps 1–2), FR-1.4, FR-1.6, NFR-3, NFR-8, NFR-9                               | 1 week    | `[x]` code and local verification; CI pending |
| 1     | Write something        | FR-1.2, FR-1.3 (steps 3–4), FR-2, FR-4, FR-8.2–8.4, FR-11.1 (part), NFR-5, authz core | 2 weeks   | `[ ]`                                         |
| 2     | The loop               | FR-5, FR-6, FR-7, FR-8.1, FR-8.5, FR-9.1–9.2, NFR-2, NFR-7                            | 3 weeks   | `[ ]`                                         |
| 3     | Findable and durable   | FR-1.5, FR-9.3–9.6, FR-11, FR-12                                                      | 2 weeks   | `[ ]`                                         |
| 4     | Versions and spin-offs | FR-10, FR-7.5                                                                         | 2 weeks   | `[ ]`                                         |
| 5     | Import and export      | FR-3, FR-14                                                                           | 2 weeks   | `[ ]`                                         |
| 6     | Trust                  | FR-13, FR-15.5, NFR-6                                                                 | 1.5 weeks | `[ ]`                                         |
| 7     | Launch                 | FR-1.1, FR-15.1–15.4, NFR-1, NFR-4, OD-1, OD-7                                        | 2 weeks   | `[ ]`                                         |

Estimates are calendar weeks at a side-project pace (from `03-build-plan.md`).

---

## Phase 0 — Foundations

**Goal.** A repository a stranger can clone, run, and contribute to, with the data model complete, the one dangerous invariant enforced by the database, an account that can sign in, and CI that refuses bad vocabulary.

### Tasks

- [x] Monorepo: pnpm workspaces + Turborepo, version catalog, shared tsconfig/ESLint presets, Prettier, EditorConfig, LF line endings, pre-commit formatting. _(2026-09-12)_
- [x] Open-source hygiene (NFR-9): AGPL-3.0 licence, README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates, Dependabot. _(2026-09-12)_
- [x] Postgres: `docker-compose.yml` for local development; Neon-compatible connection handling. _(2026-09-12)_
- [x] Prisma 7 schema in full — every model from `02-architecture.md` §3 plus the additions in decision 0004 (`SectionDraft`, `EmailVerificationToken`, `NotificationPreference`, credit inheritance, soft-delete timestamps). _(2026-09-12)_
- [x] Initial migration generated from the schema (`20260912000000_init`, 22 tables) and applied to a real Postgres 16 with no drift reported afterwards. _(2026-09-12)_
- [x] Revision immutability trigger (NFR-3) with the single hard-delete escape hatch, plus partial unique indexes for one main version per storyboard (FR-10.2) and one open request per section (FR-5.1), in `20260912000100_invariants`. Integration tests pass. _(2026-09-12)_
- [x] Idempotent seed with 24 reference genres (FR-15.6); second run creates nothing. _(2026-09-12)_
- [x] Auth.js v5, credentials provider, JWT sessions; sign-up by email → verification link (24 h, 60 s resend cooldown) → set password → signed in (FR-1.3 steps 1–2, FR-1.4, FR-1.6). Argon2id hashing. Console mailer in development, Resend in production (decision 0002). _(2026-09-12)_
- [x] tRPC 11 with superjson, `publicProcedure` and `protectedProcedure`, TanStack Query integration for client and server components. _(2026-09-12)_
- [x] Design tokens from `02-architecture.md` §9 as a Tailwind v4 theme; fonts (Newsreader, Archivo, Courier Prime) via `next/font`; shadcn `components.json` pointing at `packages/ui`; Button, Input, Label overridden to the paper-and-pencil style. _(2026-09-12)_
- [x] `scripts/check-vocabulary.ts`: AST-based scan of string literals, template literals and JSX text in user-facing folders; `vocabulary-ok` escape hatch; unit-tested including the "merge" fixture. _(2026-09-12)_
- [x] CI workflow: format, vocabulary, lint, typecheck, migrate, test (with Postgres service), build. _(2026-09-12; first run pending the push)_
- [x] Typed environment (`apps/app/src/env.ts`) that fails the build on a missing variable; single root `.env` (decision 0006). _(2026-09-12)_
- [x] Structured logger (pino) ready for NFR-7 events. _(2026-09-12)_
- [ ] Hosting: two Vercel projects (`apps/app`, `apps/web`), Neon database with branch previews, daily backups with 30-day retention (NFR-8). _Account work, not code. See the hosting checklist below._

### Exit criteria (from `03-build-plan.md`)

- [x] A signed-in user exists in the database. _Verified 2026-09-12 against the production build: sign-up → link from the console mailer → set password → credentials sign-in → session with the user id; the row has `emailVerifiedAt` set and an `$argon2id$` hash; the link was single-use; a resend inside 60 s returned `cooldown`; a wrong password was refused._
- [ ] `pnpm test` and `pnpm build` pass in CI. _Both pass locally (35 tests across four suites; both apps build). Tick after the first green run on GitHub._
- [x] A revision `UPDATE` raises. _`packages/db/src/__tests__/invariants.test.ts` passes against Postgres 16.14: UPDATE and DELETE refused with the NFR-3 message; DELETE permitted only inside a transaction that set the hard-delete flag._
- [x] The vocabulary linter catches the word "merge" in a test fixture. _`scripts/check-vocabulary.test.ts`, nine tests._

### Notes and deviations

- The build plan says Next.js 15, TipTap 2, Prisma 7. Today that is Next.js 16 (Turbopack default, `proxy.ts` instead of `middleware.ts`), TipTap 3, Prisma 7.10. Decision 0005 records every pin, including why TypeScript stays on 5.9, Vitest on 4 and ESLint on 9.
- The build plan leaves FR-1.2, FR-1.3 (username and genres), FR-1.4 and FR-1.5 unassigned. FR-1.4 and the first two onboarding steps are done here because sign-in needs them; username and genres move to Phase 1; the never-empty dashboard (FR-1.5) moves to Phase 3 where the data exists.
- `lib/authz` is listed under Phase 6 in the build plan for its careful review, but the `can()` function must exist before the first storyboard route in Phase 1. Phase 1 builds it; Phase 6 re-audits it.
- React Email is deferred to Phase 3, when there are twelve notification types to template. The single Phase 0 email is a plain function returning text and HTML (FR-12.5 wants plain anyway).
- The machine this was built on has neither Docker nor `psql`. Local verification used a throwaway embedded Postgres 16.14 started from a scratch directory outside the repository; nothing about it is committed. Contributors use `docker compose up -d` as documented.
- `pnpm test` fails, correctly, when `DATABASE_URL` points at a database that is not running. The integration suite skips itself only when `DATABASE_URL` is absent from both the shell and the root `.env`; a configured database that is down is a real failure, not a skip.

---

## Phase 1 — Write something

**Goal.** A writer can create a storyboard, write a three-chapter story, reorder it, see every revision and restore one. Nothing about contribution exists yet and that is correct.

**Resolve first:** OD-4 (does history written while private become visible on going public?). The schema already carries `Storyboard.publicFrom` for the "hide pre-switch history" answer; if the decision is "expose everything", drop the column in the Phase 1 migration.

### Tasks, in order

1. [ ] `lib/authz`: `can(actor, action, resource)` backed by the matrix in `01-srs.md` §3.2 as a table, one unit test per cell; `assertCan()`; `authorProcedure` (owner or co-author) in tRPC (architecture §7). Private storyboards return 404, not 403, to strangers.
2. [ ] Onboarding steps 3–4: choose an immutable username with the permanence warning, pin at least three genres (FR-1.3); `user.chooseUsername`, `user.pinGenres`; `onboardedAt` set; proxy sends half-onboarded users back to the step they left.
3. [ ] Guest reading of public storyboards with a persistent "sign in to help" affordance (FR-1.2).
4. [ ] `storyboard.create` with title, type, 1–3 genres, visibility; publicId and slug; the honest copying copy on the visibility selector (FR-2.1, FR-13.6 wording). New storyboard gets one main version, one chapter, one empty section (FR-2.2).
5. [ ] Chapters and sections: create, rename, delete, drag reorder rewriting `order` in one transaction (FR-2.3); split at cursor and join with the section above using `mergedIntoId` (FR-2.4).
6. [ ] Document model: restricted ProseMirror/TipTap schema (`doc`, `paragraph`, `heading` 1–3, `blockquote`, `scene_break`, `hard_break`; marks `em`, `strong`, `strike`) with paste filtering (FR-4.1); screenplay node set for screenplay-type storyboards (FR-4.2); `contentText` and word count derived on write, never edited (FR-4.3); `contentHash` (sha256) on every revision write (FR-13.6, first half).
7. [ ] Editor: autosave to `SectionDraft` after 3 s of inactivity; durable revision on blur, navigation, or 5 minutes (FR-4.4); opening someone else's section creates a private draft, never touches their content (FR-4.5); toolbar limited to italic, bold, blockquote, scene break with shortcuts (FR-4.6); live word count with the 2000-word soft warning (FR-2.5).
8. [ ] History panel: revision list with author, date, source; one-tap comparison against the head (FR-8.3) — the comparison view itself arrives in Phase 2, so this ships with a placeholder that lists both revisions. Restore creates a new revision with `restoredFromId` (FR-8.4). Immutability holds (FR-8.2).
9. [ ] Reader view: contents rail, manuscript at 62–68 ch measure in Newsreader, adjustable type size and line height persisted per user (NFR-5); chapter-by-chapter payloads so a 120k-word manuscript never ships whole (NFR-1). No margin yet.
10. [ ] Storyboard settings: visibility switch with `publicFrom` (FR-2.7, per OD-4); soft delete with the 30-day grace and the confirmation naming affected contributors (FR-2.6); rights note free text (FR-14.5).
11. [ ] Dashboard region one: storyboards you are writing (FR-11.1 partial).
12. [ ] Playwright flows 1 and 2 (architecture §8): sign up → verify → onboard → dashboard; create storyboard → write a section → (request creation is Phase 2; stop at the section).
13. [ ] Seed: one example storyboard from a public-domain text under the platform account, flagged `isSeed` (FR-15.2, FR-15.3), so the reader view has something real to render.

### Exit criteria

- [ ] Write a three-chapter story, reorder it, see every revision, restore one.
- [ ] Reader view renders 120,000 words without a frame drop.
- [ ] Every cell of the permission matrix has a passing test; a signed-in stranger gets 404 on a private storyboard at every route including the API.
- [ ] Nothing about contribution exists yet.

### Notes

---

## Phase 2 — The loop

**Goal.** The heart of the product: a request, a suggestion, a comparison, an acceptance, a credit — and a second suggestion that goes stale, is rebased and accepted too.

**Resolve first:** OD-5 (is one "helped" idea per request enough?).

### Tasks, in order

1. [ ] **`packages/compare` first, in isolation.** Pure `compare(base, target)` per architecture §4: paragraph LCS on normalised hashes, Dice-on-bigrams pairing at 0.45, rewrite mode below 0.30 alignment, `diffWordsWithSpace` marks, never below the word (FR-7.2, FR-7.3). Constants in one file with the rationale comment. Fixture corpus: light copy-edit, heavy edit, full rewrite, reordered paragraphs, added scene; snapshot the stats (architecture §8). Under 400 ms for 2000 words (NFR-2).
2. [ ] Comparison view: side by side, scroll-locked, toggle to read-through; rewrite banner; four-count summary bar; `<del>` struck and `<ins>` underlined in blue pencil, never colour-only (FR-7.1, FR-7.4, NFR-4). One component, two revision ids in, no variant code paths (FR-7.5). Server-side cache in `DiffCache` keyed on the two ids (NFR-2).
3. [ ] Contribution requests: kind picker then a per-kind form; title, 20–500-word ask, 100–500-word pre-context for rewrite/continue, suggested reading rendered inline, tone and character notes, constraints as a checklist; word bounds 150/1000 adjustable within 100–2000; the 150-word target rule per kind; states and reopen (FR-5.1–5.10).
4. [ ] Suggestions: private draft pre-filled for rewrite, empty for continue; composer with constraints pinned and a live counter; send with an optional 200-word note; `baseRevisionId` recorded; withdraw; states (FR-6.1–6.5).
5. [ ] `suggestion.accept` exactly as architecture §6.1: serialisable transaction, row lock, conflict on a moved head, new revision with contributor as author and decider as acceptor, others marked stale, credit row, request resolved (FR-6.6, FR-6.7, FR-8.1). Notifications and activity updates after the transaction, never inside.
6. [ ] Stale handling and rebase: notify, allow revise-and-resend without quota cost; second acceptance keeps both credits (FR-6.7, FR-6.8).
7. [ ] Pass: no reason required, optional fixed chips, informational notification wording; passed suggestions stay readable and appear on the profile as "written but not used" (FR-6.10, FR-6.11, FR-8.6).
8. [ ] Ideas for unblock requests: 20–400 words, one level of threading, "helped" marks a credit of type idea per OD-5 (FR-6.9).
9. [ ] Restore flips `Credit.isLive` for removed text and notifies the contributor (FR-8.5).
10. [ ] Credits and the contributors strip on every storyboard page (FR-9.1, FR-9.2).
11. [ ] Structured logs on accept, pass, restore (NFR-7). In-app notification rows for the events above (email arrives in Phase 3).
12. [ ] Playwright flows 3, 4 and 5.

### Exit criteria

- [ ] Flows 3, 4 and 5 pass end to end: two accounts, one storyboard, a suggestion accepted, a second gone stale, rebased and accepted, both credits present, the comparison readable on a full rewrite.

### Notes

---

## Phase 3 — Findable and durable

**Goal.** A user who signs up, pins genres and never creates anything still has a useful dashboard, and every notification type fires and renders in both surfaces.

**Resolve first:** OD-2 (pen names). Changing identity display after people have credits is unpleasant.

### Tasks, in order

1. [ ] Browse with filters (genre, type, request kind, word bounds, age) and the three sorts; storyboard cards with the open-requests badge as the primary call to action (FR-11.3, FR-11.4). Search limited to title and author name (FR-11.6).
2. [ ] Dashboard regions two and three; genre pinning editable; the never-empty landing (FR-1.5, FR-11.1, FR-11.2).
3. [ ] Reader margin: request cards with leader rules that thicken and turn blue pencil on hover; click scrolls and highlights the section (FR-11.5).
4. [ ] Profiles: authored, accepted, ideas that helped, spin-offs, the 365-day contribution calendar from `ActivityDay`, reverse-chronological feed; "written but not used" collapsed and private by default (FR-9.3, FR-9.4). Credits page and plain-text credit export (FR-9.2, FR-9.6).
5. [ ] Notification centre; per-type email toggles in settings; all twelve event types (FR-12.1, FR-12.2).
6. [ ] Inngest: immediate email for decisions on your own work, hourly digest for the rest, Sunday weekly digest of open requests in your genres; the seven-day silence nudge with its two one-click actions (FR-12.3, FR-12.4). React Email templates, plain and single-column, no tracking pixels (FR-12.5).
7. [ ] Settings screen: account, genres, notifications, reading preferences.

### Exit criteria

- [ ] A user who signs up, pins genres and never creates anything has a useful dashboard.
- [ ] Every notification type fires in a test and renders in-app and by email.

### Notes

---

## Phase 4 — Versions and spin-offs

**Goal.** Alternate versions inside a storyboard and spin-offs across storyboards, with credits that survive both.

**Resolve first:** OD-3 (a contributor's right to delete their credit record). It changes what `Credit` deletion means and it is a legal question.

### Tasks, in order

1. [ ] `version.create` copies the chapter/section tree at the current head, sharing revisions; rename; delete non-main (FR-10.1, architecture §2.2).
2. [ ] Promote to main: two-row update in one transaction; record the swap; previous main retained (FR-10.2).
3. [ ] Cross-version comparison: outer-join sections on `lineageId`, diff head pairs, added and removed sections shown (FR-7.5, architecture §2.3). Versions screen.
4. [ ] Spin-off: new storyboard owned by the spinner with `forkedFromId`, `forkedFromVersionId`, `forkedAt`, `forkedRevisionMap`; original author notified, not asked; not possible on private storyboards (FR-10.3, FR-10.7).
5. [ ] Lineage banner "spun off from … on … — that story has continued since"; chain truncated to three ancestors with a full-lineage link; spin-off count and list on the original (FR-10.4–10.6).
6. [ ] Credit inheritance: copy credit rows into the spin-off with `inheritedFromId`; credits page shows origin and inherited credits above new ones (FR-9.5).
7. [ ] Rate limit groundwork: one spin-off of a given storyboard per user per day (FR-13.3, enforced fully in Phase 6).

### Exit criteria

- [ ] Spin off a storyboard, write three chapters on it; the original shows the spin-off with correct inherited credits; the spin-off shows the "has continued since" banner.
- [ ] Promoting an alternate to main loses nothing.

### Notes

---

## Phase 5 — Import and export

**Goal.** Bring an 80,000-word manuscript in with its structure recognised and correctable in under two minutes, and take it back out with contributors intact.

### Tasks, in order

1. [ ] Upload to R2 via presigned URL; 5 MB and 300,000-word limits; the "what survives" table shown before the file is chosen (FR-3.1, FR-3.7).
2. [ ] `packages/import`: `extract()` per format into `NormalisedDoc` (`mammoth` for .docx, `marked` for .md, plain split for .txt/.rtf, `fountain-js` for .fountain, XML for .fdx); `detectChapters()` as the seven-strategy cascade reporting which fired; `detectSections()` on scene-break glyphs, double blank lines, then 1200-word hard splits (FR-3.3, FR-3.4, architecture §5). One fixture per format including a .docx with no heading styles.
3. [ ] Boundary review screen: scrubbable outline, first twelve words per section, confidence in words never numbers, add/move/remove every boundary; nothing written until confirmed (FR-3.2, FR-3.5). `ImportJob` state machine.
4. [ ] `commit()` writes the version tree with `RevisionSource.IMPORTED`.
5. [ ] Exports: .docx, .md, .pdf, .fountain for screenplays; contributors page in the front matter and the source-URL footer, not removable (FR-14.2, FR-14.3). .epub deferred to Phase 7 or later.
6. [ ] Finished state: reading page with no margin and no request cards, contributors linked from the foot (FR-14.1).
7. [ ] Proof-of-authorship export: signed PDF with title, author, section, word count, sha256, timestamp (FR-13.6).

### Exit criteria

- [ ] Import a real 80,000-word .docx with no heading styles, correct the proposed boundaries in under two minutes, export it back out with contributors intact.

### Notes

---

## Phase 6 — Trust

**Goal.** The product holds under bad actors and careless ones, and a mistake cannot expose an unpublished manuscript.

**Resolve first:** OD-6 (co-author quota exemption across storyboards).

### Tasks, in order

1. [ ] Quota: at most three submitted suggestions per contributor per storyboard, counted inside the submit transaction; owners and co-authors exempt on their own storyboards per OD-6 (FR-13.2, architecture §6.1).
2. [ ] Global rate limits with Upstash sliding windows: 10 suggestions/day, 20 ideas/day, 3 ideas per request, 5 storyboards/day, 1 spin-off per storyboard per day (FR-13.3). Also on sign-up and verification resend.
3. [ ] Community rules page at a permanent URL, shown once at sign-up (FR-13.4).
4. [ ] Reporting: user, storyboard, suggestion, idea; five categories; dedup per reporter and target; ten upheld reports suspend pending review; counts never public (FR-13.5).
5. [ ] Admin: report queue with one-key decisions, reversible suspension, seeded-content manager, feature flags (FR-13.7, FR-15.5).
6. [ ] The honest visibility copy everywhere it belongs (FR-13.6).
7. [ ] Re-audit `lib/authz` line by line with fresh attention; private storyboard returns 404 to a signed-in stranger at every route including the API (NFR-6).
8. [ ] Hard-delete job for storyboards past the 30-day grace, using the trigger's escape hatch inside one transaction (FR-2.6). Account deletion per OD-3.

### Exit criteria

- [ ] A fourth submitted suggestion is refused with a clear message.
- [ ] Ten upheld reports suspend an account.
- [ ] A private storyboard returns 404, not 403, to a signed-in stranger at every route including the API.

### Notes

---

## Phase 7 — Launch

**Goal.** A stranger lands on the marketing site, reads a real stuck passage without an account, signs up, and sends a suggestion in under five minutes without asking anyone a question.

**Resolve first:** OD-1 (the name) and OD-7 (under-16 policy). OD-7 is not optional.

### Tasks, in order

1. [ ] Seeds: 25 public-domain storyboards across at least 6 genres, 40 open requests spanning all three kinds, 15 answered requests with accepted suggestions and comparison views; every one labelled _example_ under the platform account; legally clean sources only (FR-15.1–15.4, FR-15.6).
2. [ ] Marketing site: hero is a real stuck passage with a real accepted suggestion beside it; two example storyboards readable without an account; one sign-up call to action (FR-1.1). The sixty-second target.
3. [ ] Community rules page linked from sign-up and the footer.
4. [ ] Accessibility audit to WCAG 2.2 AA: keyboard navigation of the manuscript, heading structure, comparison marks not colour-only (NFR-4).
5. [ ] Performance pass: reader first contentful paint under 1.2 s on 3G-fast; chapter-by-chapter payloads confirmed (NFR-1).
6. [ ] Rename per OD-1: find-and-replace on the string, domains, Vercel projects, email sender.
7. [ ] Age policy per OD-7 implemented in sign-up and messaging surfaces.
8. [ ] Backups verified by an actual restore drill (NFR-8). Structured-log dashboards for the NFR-7 events.
9. [ ] All six Playwright flows pass against production. Then, and only then, the traffic post.

### Exit criteria

- [ ] A stranger can land on the marketing site, read a real stuck passage without an account, sign up, and send a suggestion in under five minutes without asking you a question.

### Notes

---

## Every phase, every pull request

- `pnpm check-vocabulary`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Schema change → migration + seed update.
- New procedure → authz decision at the data layer + a matrix test if a new cell is touched.
- Socially significant event (accept, pass, restore, spin-off, report, suspend) → structured log line with an `event` field.
- User-facing copy in sentence case; buttons name their consequence.
- This file updated: tick the task, note the date, record any deviation.

## Open decisions

| OD   | Question                                                 | Blocks                 | Status | Decision                                                                              |
| ---- | -------------------------------------------------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------- |
| OD-1 | The name (domain taken; crowded in film)                 | Phase 7                | open   | —                                                                                     |
| OD-2 | Helping under a pen name separate from the account       | Phase 3                | open   | —                                                                                     |
| OD-3 | Contributor's right to delete their credit record (GDPR) | Phase 4                | open   | —                                                                                     |
| OD-4 | Hide history written while private after going public?   | Phase 1                | open   | Schema carries `publicFrom` for "hide"; drop it if the answer is "expose everything". |
| OD-5 | One "helped" idea per request, or unlimited              | Phase 2                | open   | —                                                                                     |
| OD-6 | Co-author quota exemption across storyboards             | Phase 6                | open   | —                                                                                     |
| OD-7 | Under-16 policy and adult-to-minor messaging             | Phase 7 (not optional) | open   | —                                                                                     |

## Hosting and services checklist

Account work, not code. Each row says which phase first needs it.

| Service                                                                                            | Purpose                                         | Needed from                    | Status |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | ------ |
| GitHub repository, branch protection on `main`, Dependabot, `good first issue` label               | NFR-9                                           | Phase 0                        | `[ ]`  |
| Vercel project for `apps/app`                                                                      | hosting                                         | Phase 0                        | `[ ]`  |
| Vercel project for `apps/web`                                                                      | hosting                                         | Phase 0                        | `[ ]`  |
| Neon Postgres 16 with branch previews per PR; point-in-time restore configured for 30 days (NFR-8) | database, backups                               | Phase 0                        | `[ ]`  |
| Resend with a verified sending domain                                                              | FR-1.3 emails, FR-12                            | Phase 0 (dev works without it) | `[ ]`  |
| Inngest                                                                                            | digests, nudges, post-transaction notifications | Phase 3                        | `[ ]`  |
| Cloudflare R2 bucket                                                                               | imports, exports                                | Phase 5                        | `[ ]`  |
| Upstash Redis                                                                                      | rate limits                                     | Phase 6                        | `[ ]`  |
| Domain(s) for the final name, DNS, `app.` subdomain                                                | OD-1                                            | Phase 7                        | `[ ]`  |

## Deviations from `02-architecture.md`

Recorded as short decision records in `docs/decisions/`:

- 0002 — Authentication model: nullable `username`/`passwordHash` until onboarding completes, own `EmailVerificationToken` table, JWT sessions without the Auth.js database adapter, Argon2id.
- 0003 — Database-enforced invariants: the revision trigger's transaction-scoped hard-delete flag and its SQLSTATE; partial unique indexes for one main version and one open request.
- 0004 — Schema additions: `SectionDraft`, `NotificationPreference`, `Credit.inheritedFromId`, `Storyboard.deletedAt`/`finishedAt`/`forkedFromVersionId`, `User.isAdmin`/`onboardedAt`; `Version` has no `@@unique([storyboardId, isMain])` (it would also forbid a second non-main version).
- 0005 — Toolchain versions: Next 16, TipTap 3, Zod 4, tRPC's TanStack Query integration, TypeScript 5.9, Vitest 4, ESLint 9, pnpm catalog.
- 0006 — One `.env` at the repository root.

## Change log

- 2026-09-12 — Created. Phase 0 built and verified locally against Postgres 16 (migrations, seed, 35 tests, both production builds, the full sign-up and sign-in flow). CI green run pending the first push.
