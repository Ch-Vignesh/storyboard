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

|                  |                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase**        | 8 — Into the world (every part that is code is done; the rest needs accounts)                                                                                                                                                                                                   |
| **State**        | Everything phase 8 can do without an account is done and verified: the deployment configuration, the startup preflight, the restore drill, the automated accessibility pass, and the seeded-excerpt check — which found thirteen misquotations and a wrong citation, all fixed. |
| **Last updated** | 2026-09-15                                                                                                                                                                                                                                                                      |
| **Next actions** | 1. Open the five accounts (Neon, Cloudflare R2, two Vercel projects, Resend) and follow `docs/05-deployment.md`. 2. Run the restore drill and the screen-reader pass, and record both dates here. Nothing else in the plan can move until the accounts exist.                   |

## Overview

| Phase | Name                   | Requirements                                                                          | Estimate  | Status                                |
| ----- | ---------------------- | ------------------------------------------------------------------------------------- | --------- | ------------------------------------- |
| 0     | Foundations            | FR-1.3 (steps 1–2), FR-1.4, FR-1.6, NFR-3, NFR-8, NFR-9                               | 1 week    | `[x]` complete, CI green 2026-09-14   |
| 1     | Write something        | FR-1.2, FR-1.3 (steps 3–4), FR-2, FR-4, FR-8.2–8.4, FR-11.1 (part), NFR-5, authz core | 2 weeks   | `[x]` committed, CI green             |
| 2     | The loop               | FR-5, FR-6, FR-7, FR-8.1, FR-8.5, FR-9.1–9.2, NFR-2, NFR-7                            | 3 weeks   | `[x]` committed, CI green             |
| 3     | Findable and durable   | FR-1.5, FR-9.3–9.6, FR-11, FR-12                                                      | 2 weeks   | `[x]` committed, CI green             |
| 4     | Versions and spin-offs | FR-10, FR-7.5                                                                         | 2 weeks   | `[x]` committed, CI green             |
| 5     | Import and export      | FR-3, FR-14                                                                           | 2 weeks   | `[x]` committed, CI green             |
| 6     | Trust                  | FR-13, FR-15.5, NFR-6                                                                 | 1.5 weeks | `[x]` committed, pushed               |
| 7     | Launch                 | FR-1.1, FR-15.1–15.4, NFR-1, NFR-4, OD-1, OD-7                                        | 2 weeks   | `[x]` committed, pushed               |
| 8     | Into the world         | NFR-8, and every blocked task from phases 0–7                                         | 1 week    | `[~]` code done, accounts outstanding |
| 9     | The gaps we left       | FR-14.2 (.epub), FR-1.6, OD-3 (second half), decision 0017                            | 2 weeks   | `[ ]`                                 |
| 10    | What writers ask for   | Driven by use, not by this plan                                                       | open      | `[ ]`                                 |

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
- [x] `pnpm test` and `pnpm build` pass in CI. _Green on the first push, 2026-09-14 (workflow run 1 on `main`)._
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

**Resolved:** OD-4 — pre-switch history stays private. `Storyboard.publicFrom` is kept and no column was dropped. See decision 0007.

### Tasks, in order

1. [x] `lib/authz`: `can(actor, action, resource)` backed by the matrix in `01-srs.md` §3.2 as a table, one unit test per cell; `assertCan()`; `authorProcedure` (owner or co-author) in tRPC (architecture §7). Private storyboards return 404, not 403, to strangers. _(2026-09-14)_
2. [x] Onboarding steps 3–4: choose an immutable username with the permanence warning, pin at least three genres (FR-1.3); `user.chooseUsername`, `user.pinGenres`; `onboardedAt` set; proxy sends half-onboarded users back to the step they left. _(2026-09-14)_
3. [x] Guest reading of public storyboards with a persistent "sign in to help" affordance (FR-1.2). _(2026-09-14)_
4. [x] `storyboard.create` with title, type, 1–3 genres, visibility; publicId and slug; the honest copying copy on the visibility selector (FR-2.1, FR-13.6 wording). New storyboard gets one main version, one chapter, one empty section (FR-2.2). _(2026-09-14)_
5. [x] Chapters and sections: create, rename, delete, drag reorder rewriting `order` in one transaction (FR-2.3); split at cursor and join with the section above using `mergedIntoId` (FR-2.4). _(2026-09-14)_
6. [x] Document model: restricted ProseMirror/TipTap schema (`doc`, `paragraph`, `heading` 1–3, `blockquote`, `scene_break`, `hard_break`; marks `em`, `strong`, `strike`) with paste filtering (FR-4.1); screenplay node set for screenplay-type storyboards (FR-4.2); `contentText` and word count derived on write, never edited (FR-4.3); `contentHash` (sha256) on every revision write (FR-13.6, first half). _(2026-09-14)_
7. [x] Editor: autosave to `SectionDraft` after 3 s of inactivity; durable revision on blur, navigation, or 5 minutes (FR-4.4); opening someone else's section creates a private draft, never touches their content (FR-4.5); toolbar limited to italic, bold, blockquote, scene break with shortcuts (FR-4.6); live word count with the 2000-word soft warning (FR-2.5). _(2026-09-14)_
8. [x] History panel: revision list with author, date, source; one-tap comparison against the head (FR-8.3) — the comparison view itself arrives in Phase 2, so this ships with a placeholder that lists both revisions. Restore creates a new revision with `restoredFromId` (FR-8.4). Immutability holds (FR-8.2). _(2026-09-14)_
9. [x] Reader view: contents rail, manuscript at 62–68 ch measure in Newsreader, adjustable type size and line height persisted per user (NFR-5); chapter-by-chapter payloads so a 120k-word manuscript never ships whole (NFR-1). No margin yet. _(2026-09-14)_
10. [x] Storyboard settings: visibility switch with `publicFrom` (FR-2.7, per OD-4); soft delete with the 30-day grace and the confirmation naming affected contributors (FR-2.6); rights note free text (FR-14.5). _(2026-09-14)_
11. [x] Dashboard region one: storyboards you are writing (FR-11.1 partial). _(2026-09-14)_
12. [x] Playwright flows 1 and 2 (architecture §8): sign up → verify → onboard → dashboard; create storyboard → write a section → (request creation is Phase 2; stop at the section). Plus guest reading, the 404-on-private rule, and the NFR-1 reader measurement: eight tests in all. _(2026-09-14)_
13. [x] Seed: one example storyboard from a public-domain text under the platform account, flagged `isSeed` (FR-15.2, FR-15.3), so the reader view has something real to render. _(2026-09-14)_

### Exit criteria

- [x] Write a three-chapter story, reorder it, see every revision, restore one. _Verified against Postgres 16.14: the seeded example is three chapters and eleven sections; `chapter.reorder` and `section.reorder` rewrite every sibling in one transaction; the history panel lists each version with its author, date and source, and restore appends a new revision carrying `restoredFromId`._
- [x] Reader view renders 120,000 words without a frame drop. _Measured, not assumed: `e2e/reader-performance.spec.ts` builds a real 24-chapter, 120,000-word storyboard and asserts the first response carries roughly one chapter rather than the book, that first contentful paint is inside NFR-1's 1.2 s budget, and that changing chapter produces no main-thread task long enough to drop a frame (Long Tasks API). Loopback with no throttling is a floor rather than NFR-1's 3G-fast condition, so the throttled measurement stays on the phase 7 performance pass._
- [x] Every cell of the permission matrix has a passing test; a signed-in stranger gets 404 on a private storyboard at every route including the API. _60 cells, one test each, in `lib/authz/matrix.test.ts` (96 tests in the file). The 404 rule is also a flow test: a signed-in stranger and a guest both get 404 on the storyboard and on `/settings`, `/contents`, `/c/1/1/edit` and `/c/1/1/history`._
- [x] Nothing about contribution exists yet. _No request, suggestion, idea or credit router. The two places phase 2 will hook into are marked with `TODO(phase 2, …)` and named in the notes below._

### Notes

- **Task order.** The document model (task 6) was built before `storyboard.create` (task 4), because creating a storyboard has to write an empty section, and an empty section needs a canonical document, a word count and a content hash. Everything else ran in the order the plan gives.
- **Two schema changes, both with a migration and a decision record.**
  - `20260914151718_chapter_and_section_tombstones` adds `deletedAt` to `Chapter` and `Section`. FR-8.2 allows exactly two hard deletes in this product and a structural delete is neither of them, so deleting a chapter or section is a tombstone, like FR-2.4's merge. Decision 0008.
  - `20260914152253_reading_preferences` adds `readingTypeScale` and `readingLineHeight` to `User`. NFR-5 says "persisted per user", which `localStorage` is not. Decision 0009.
- **OD-4 is decision 0007.** The rule lives in `lib/authz` in two forms that have to agree — `canReadRevisionAt` for one revision and `revisionVisibilityWhere` as a Prisma fragment — and a test asserts they do. `publicFrom` means "the first instant this was public" and is never cleared.
- **The editor names nodes as the SRS does.** TipTap defaults to `bold`, `italic` and `hardBreak`; FR-4.1 specifies `strong`, `em` and `hard_break`. The three extensions are renamed rather than translated on the way in and out, so `contentJson` is one format everywhere. `tiptap.test.ts` holds the editor schema and the Zod schema to the same set, and fails if either grows a node.
- **A concurrency bug the flow tests caught.** Clicking "Save now" blurs the editor, so the blur handler and the click handler both opened a transaction on the same section row and deadlocked. Saves are now single-flight.
- **Hooks left for phase 2**, both marked in the code: `storyboard.setVisibility` does not yet close open requests when going private (FR-2.7), and `section.restoreRevision` does not yet flip `Credit.isLive` or notify (FR-8.5). Neither has anything to act on until requests and credits exist.
- **The comparison placeholder.** FR-8.3's one-tap comparison names both versions and their word counts and hashes; the side-by-side view is phase 2 task 2 and the panel says so rather than implying a diff it cannot compute.
- **Flow tests need a database and a build**, so `pnpm e2e` builds the application and starts it. The console mailer appends to `MAIL_LOG_FILE` when set, which is how the sign-up flow reads its own verification link — it can only run when `RESEND_API_KEY` is unset, which is what selects that mailer in the first place.
- **Guest reading (task 3)** has no screen of its own: it is the reader with a "sign in to help" affordance and no authoring controls, which is what FR-1.2 asks for. A flow test covers it.
- **This machine still has no Docker or `psql`.** Phase 1 was verified against a throwaway embedded Postgres 16.14 on port 55432, outside the repository; migrations were applied from scratch into a clean database and reported no drift. Nothing about it is committed.

---

## Phase 2 — The loop

**Goal.** The heart of the product: a request, a suggestion, a comparison, an acceptance, a credit — and a second suggestion that goes stale, is rebased and accepted too.

**Resolved:** OD-5 — one credited idea per request, as FR-6.9 is written, enforced by a partial unique index. See decision 0010.

### Tasks, in order

1. [x] **`packages/compare` first, in isolation.** Pure `compare(base, target)` per architecture §4: paragraph LCS on normalised hashes, Dice-on-bigrams pairing at 0.45, rewrite mode below 0.30 alignment, `diffWordsWithSpace` marks, never below the word (FR-7.2, FR-7.3). Constants in one file with the rationale comment. Fixture corpus: light copy-edit, heavy edit, full rewrite, reordered paragraphs, added scene; snapshot the stats (architecture §8). Under 400 ms for 2000 words (NFR-2). _(2026-09-14)_
2. [x] Comparison view: side by side, scroll-locked, toggle to read-through; rewrite banner; four-count summary bar; `<del>` struck and `<ins>` underlined in blue pencil, never colour-only (FR-7.1, FR-7.4, NFR-4). One component, two revision ids in, no variant code paths (FR-7.5). Server-side cache in `DiffCache` keyed on the two ids (NFR-2). _(2026-09-14)_
3. [x] Contribution requests: kind picker then a per-kind form; title, 20–500-word ask, 100–500-word pre-context for rewrite/continue, suggested reading rendered inline, tone and character notes, constraints as a checklist; word bounds 150/1000 adjustable within 100–2000; the 150-word target rule per kind; states and reopen (FR-5.1–5.10). _(2026-09-14)_
4. [x] Suggestions: private draft pre-filled for rewrite, empty for continue; composer with constraints pinned and a live counter; send with an optional 200-word note; `baseRevisionId` recorded; withdraw; states (FR-6.1–6.5). _(2026-09-14)_
5. [x] `suggestion.accept` exactly as architecture §6.1: serialisable transaction, row lock, conflict on a moved head, new revision with contributor as author and decider as acceptor, others marked stale, credit row, request resolved (FR-6.6, FR-6.7, FR-8.1). Notifications and activity updates after the transaction, never inside. _(2026-09-14)_
6. [x] Stale handling and rebase: notify, allow revise-and-resend without quota cost; second acceptance keeps both credits (FR-6.7, FR-6.8). _(2026-09-14)_
7. [x] Pass: no reason required, optional fixed chips, informational notification wording; passed suggestions stay readable and appear on the profile as "written but not used" (FR-6.10, FR-6.11, FR-8.6). _(2026-09-14)_
8. [x] Ideas for unblock requests: 20–400 words, one level of threading, "helped" marks a credit of type idea per OD-5 (FR-6.9). _(2026-09-14)_
9. [x] Restore flips `Credit.isLive` for removed text and notifies the contributor (FR-8.5). _(2026-09-14)_
10. [x] Credits and the contributors strip on every storyboard page (FR-9.1, FR-9.2). _(2026-09-14)_
11. [x] Structured logs on accept, pass, restore (NFR-7). In-app notification rows for the events above (email arrives in Phase 3). _(2026-09-14)_
12. [x] Playwright flows 3, 4 and 5. _(2026-09-14)_

### Exit criteria

- [x] Flows 3, 4 and 5 pass end to end: two accounts, one storyboard, a suggestion accepted, a second gone stale, rebased and accepted, both credits present, the comparison readable on a full rewrite. _`e2e/flow-3-4-5-the-loop.spec.ts`, run against a production build and a real Postgres 16.14. Eleven flow tests pass in total._

### Notes

- **The comparison engine is its own package**, `@storyboard/compare`, with no database and no rendering, per architecture section 4. 33 tests over the fixture corpus the architecture asks for — light copy-edit, heavy edit, full rewrite, reordered paragraphs, added scene, plus the empty cases — and an NFR-2 timing test on a 2000-word section.
- **Two bugs the tests found in the engine itself.**
  - `normalise` stripped combining marks, because `\p{L}` excludes them. "মেঘ জমেছে" became "ম ঘ জম ছ", which would have made comparison meaningless in Bengali, Devanagari, Arabic, Hebrew and Thai. `\p{M}` is now in the keep set, with a test.
  - A paragraph whose only change was punctuation aligned as `same` — normalisation is what made them match — so a copy-edit that moved a comma showed as unchanged. A matched pair whose _raw_ text differs is now promoted to `changed` and gets word marks.
- **OD-5 is decision 0010**, enforced by `one_helpful_idea_per_request`, a partial unique index in the migration of the same name. It sits beside the other two partial indexes, for the same reason: two co-authors deciding at the same instant both pass an application check.
- **FR-8.5 is now real.** `section.restoreRevision` walks the parent chain of the revision being restored to, marks every credit outside that ancestry `isLive: false`, and notifies the contributor after the transaction. Nothing is deleted — principle 1.3.3.
- **Three screens were pulled forward from phase 3** because phase 2 creates things that must be reachable: a minimal `/browse` (FR-11.3's filters stay in phase 3), the dashboard's third region (FR-11.1), and a profile at `/@{username}` showing credits (FR-9.3's calendar and the collapsed "written but not used" section stay in phase 3). Each says in its own file what it is missing. The alternative was shipping links that 404.
- **`/@{username}` is a rewrite.** A folder whose name starts with an at sign is a parallel route slot in the App Router, so the page lives at `/u/{username}` and `next.config.ts` maps the public URL onto it.
- **Demo data is a separate entry point**, `pnpm db:seed:demo`, never part of `pnpm db:seed`. It creates three accounts that share one published password, so it refuses to run against a non-local database, and the production seed path cannot reach it. It fills every phase 2 screen: three request kinds, a suggestion accepted with its credit, one stale, one passed, a copy-edit whose comparison shows marks, a replacement whose comparison shows read-through, and an idea thread with one idea credited.
- **Deliberately not built:** email (FR-12.3's batching is phase 3), the seven-day quiet nudge (FR-12.4), and the activity calendar (FR-9.3). Notification _rows_ are written for every event phase 2 produces, so phase 3 has something to send.

---

## Phase 3 — Findable and durable

**Goal.** A user who signs up, pins genres and never creates anything still has a useful dashboard, and every notification type fires and renders in both surfaces.

**Resolved:** OD-2 — one public name, no pen names. `username` is immutable and owns the URL; `displayName` is editable and is what the interface shows. See decision 0011.

### Tasks, in order

1. [x] Browse with filters (genre, type, request kind, word bounds, age) and the three sorts; storyboard cards with the open-requests badge as the primary call to action (FR-11.3, FR-11.4). Search limited to title and author name (FR-11.6). _(2026-09-15)_
2. [x] Dashboard regions two and three; genre pinning editable; the never-empty landing (FR-1.5, FR-11.1, FR-11.2). _(2026-09-15)_
3. [x] Reader margin: request cards with leader rules that thicken and turn blue pencil on hover; click scrolls and highlights the section (FR-11.5). _(2026-09-15)_
4. [x] Profiles: authored, accepted, ideas that helped, spin-offs, the 365-day contribution calendar from `ActivityDay`, reverse-chronological feed; "written but not used" collapsed and private by default (FR-9.3, FR-9.4). Credits page and plain-text credit export (FR-9.2, FR-9.6). _(2026-09-15)_
5. [x] Notification centre; per-type email toggles in settings; all twelve event types (FR-12.1, FR-12.2). _(2026-09-15)_
6. [x] Inngest: immediate email for decisions on your own work, hourly digest for the rest, Sunday weekly digest of open requests in your genres; the seven-day silence nudge with its two one-click actions (FR-12.3, FR-12.4). React Email templates, plain and single-column, no tracking pixels (FR-12.5). _(2026-09-15)_
7. [x] Settings screen: account, genres, notifications, reading preferences. _(2026-09-15)_

### Exit criteria

- [x] A user who signs up, pins genres and never creates anything has a useful dashboard. _Region one offers the one thing worth doing, region two hides itself when there is no news rather than showing an empty heading, and region three fills with open requests in the genres they pinned. FR-1.5 is satisfied by construction: there is no path to an empty dashboard._
- [x] Every notification type fires in a test and renders in-app and by email. _`src/server/mail/digests.test.ts`, nine tests against a real Postgres: all twelve types defined with copy and a delivery class, every immediate type emailed individually, every hourly type batched into one message, no double sends, per-type switches honoured, suspended accounts never emailed, and the nudge wording held to FR-12.4._

### Notes

- **The job runner is cron endpoints, not Inngest** (decision 0012). The work is four plain functions over a database and a clock; `/api/cron/[job]` and `pnpm cron <job>` both call them, and so do the tests. The cost is no automatic retries, which the `emailedAt` ledger mitigates for the hourly run and not for the weekly one — that is written down in the decision rather than discovered later.
- **OD-2 is decision 0011.** One public name. `displayName` became editable in settings; `username` still owns the URL and never changes.
- **`ActivityDay` was never written to before this phase.** The table existed from phase 0 and nothing filled it, so the contribution calendar would have been permanently empty. `server/activity.ts` now records a unit of work on save, suggestion sent, idea posted, accept, pass and request opened — after the transaction, and it never throws, because a calendar square is not worth failing a save over.
- **One migration**, `20260914182045_show_passed_work`. FR-9.4 needs a per-user flag and it defaults to **false**: the requirement is explicit that defaulting unused work to public would make being passed on feel punitive.
- **Three accessibility defects fixed across the whole application**, found by working through a UX checklist rather than by inspection. Inputs were 14px, which makes iOS Safari zoom the page on focus — they are now 16px on touch widths and 14px above. There was no skip link anywhere, on a product whose main screen puts a contents rail and a margin before the manuscript. And `prefers-reduced-motion` was unhandled.
- **The email templates are not React Email**, which the architecture suggested. Every one of these messages is a sentence, a link and a sign-off; the whole HTML body is nine lines, and FR-12.5 asks for plain and single-column anyway. A component library would have been more code than the thing it renders.
- **Demo data gained two things** so the prototype can demonstrate the digests: everyone pins genres (the weekly digest never sends someone their own request, so a single genre-pinning author produces nothing), and there is now a request nobody has answered, old enough to be nudged.
- **Deferred deliberately:** avatars (FR-9.3 mentions them, nothing uploads one yet — that is phase 5's file handling), and the `?widen=1` deep link the nudge offers, which currently lands on the request rather than opening the word-bounds control.

---

## Phase 4 — Versions and spin-offs

**Goal.** Alternate versions inside a storyboard and spin-offs across storyboards, with credits that survive both.

**Resolved first:** OD-3 — **erase on request, keep the revision** (decision 0013). A
contributor may erase their record; the prose stays in the manuscript it was
accepted into and is re-attributed to "a former contributor".

### Tasks, in order

1. [x] `version.create` copies the chapter/section tree at the current head, sharing revisions; rename; delete non-main (FR-10.1, architecture §2.2). _(2026-09-15)_
2. [x] Promote to main: two-row update in one transaction; record the swap; previous main retained (FR-10.2). _(2026-09-15)_
3. [x] Cross-version comparison: outer-join sections on `lineageId`, compare head pairs, added and removed sections shown (FR-7.5, architecture §2.3). Versions screen and comparison screen. _(2026-09-15)_
4. [x] Spin-off: new storyboard owned by the spinner with `forkedFromId`, `forkedFromVersionId`, `forkedAt`, `forkedRevisionMap`; original author notified, not asked; not possible on private storyboards (FR-10.3, FR-10.7). _(2026-09-15)_
5. [x] Lineage banner "spun off from … on … — that story has continued since"; chain truncated to three ancestors with a full-lineage link; spin-off count and list on the original (FR-10.4–10.6). _(2026-09-15)_
6. [x] Credit inheritance: copy credit rows into the spin-off with `inheritedFromId`; credits page shows origin and inherited credits above new ones (FR-9.5). _(2026-09-15)_
7. [x] Rate limit groundwork: one spin-off of a given storyboard per user per day (FR-13.3, enforced fully in Phase 6). _(2026-09-15)_
8. [x] OD-3: `Revision.authorId` and `Credit.contributorId` made nullable, `Credit.erasedAt` added, the NFR-3 trigger given one narrow hatch, and `profile.eraseContribution` with its confirmation on the writer's own profile (decision 0013). _(2026-09-15)_

### Exit criteria

- [x] Spin off a storyboard, write three chapters on it; the original shows the spin-off with correct inherited credits; the spin-off shows the "has continued since" banner. _Verified 2026-09-15 by `e2e/flow-6-versions-and-spin-offs.spec.ts`, entirely through the interface: a reader spins off a public storyboard, the prose and the credits arrive with it, the banner names the original and its author, the lineage page shows the chain, three sections are written, and the original's lineage page counts the spin-off without naming it (it is private) and offers the author no way to remove it._
- [x] Promoting an alternate to main loses nothing. _Verified 2026-09-15 in the same file: an alternate is started from the main draft at 11 words (the head revision is shared, not copied), rewritten, compared, and promoted; the draft it replaced is still listed and still readable at its own address, and the manuscript at `/s/{slug}` is the promoted one._

### Notes

- **Two schema bugs surfaced, both from phase 0, both recorded.** `Section.currentRevisionId`
  was `@unique`, which made a copied section unable to share its base's head
  revision — the exact thing architecture §2.2 says versions do (decision 0014).
  And the NFR-3 trigger refused every `UPDATE` on `Revision`, which OD-3's answer
  requires exactly once (decision 0013). Neither was reachable before this phase.
- **The trigger's hatch is narrow by construction.** It permits an update only
  when a transaction-scoped flag is set, only when authorship is being cleared,
  and only when every other column — `contentHash` included — is unchanged. Seven
  tests in `packages/db/src/__tests__/erasure.test.ts` are about what it still
  refuses, including that the flag does not leak across transactions.
- **The section routes were version-blind, and the flow test caught it.** `/s/{slug}/c/{n}/{m}`
  resolved positions against the main draft regardless of which version was
  being read, so reading an alternate and clicking Edit wrote into the main
  draft. `locate()` now takes a version, and every link out of a version carries
  it. This is the kind of defect a unit test cannot see and a flow test cannot
  miss.
- **The banner only claims what it can check.** FR-10.4's wording asserts the
  original "has continued since"; `spinOff.lineage` counts revisions written
  after `forkedAt` and the sentence ends early when there are none.
- **A promoted alternate leaves a version still named "Main draft".** The name is
  the author's, and renaming somebody's draft to tidy up an adjective would be
  worse than the momentary oddity. The badge says which one is current.
- Live spin-off tracking stays deferred (SRS section 8): the banner is the cheap
  honest answer, as the requirement itself says.

---

## Phase 5 — Import and export

**Goal.** Bring an 80,000-word manuscript in with its structure recognised and correctable in under two minutes, and take it back out with contributors intact.

### Tasks, in order

1. [x] Upload to R2 via presigned URL; 5 MB and 300,000-word limits; the "what survives" table shown before the file is chosen (FR-3.1, FR-3.7). _(2026-09-15)_
2. [x] `packages/import`: `extract()` per format into `NormalisedDoc` (`mammoth` for .docx, `marked` for .md, plain split for .txt/.rtf, a hand-written reader for .fountain per decision 0015, `fast-xml-parser` for .fdx); `detectChapters()` as the seven-strategy cascade reporting which fired; `detectSections()` on scene-break glyphs, then 1200-word hard splits (FR-3.3, FR-3.4, architecture §5). One fixture per format, including a real .docx with no heading styles. _(2026-09-15)_
3. [x] Boundary review screen: outline with the first twelve words per section, confidence in words never numbers, join/split/start-a-chapter on every boundary; nothing written until confirmed (FR-3.2, FR-3.5). `ImportJob` state machine. _(2026-09-15)_
4. [x] `commit()` writes the version tree with `RevisionSource.IMPORTED`, in one transaction. _(2026-09-15)_
5. [x] Exports: .docx, .md, .pdf, .fountain for screenplays; contributors page in the front matter and the source-URL footer, not removable (FR-14.2, FR-14.3). .epub deferred to Phase 7 or later. _(2026-09-15)_
6. [x] Finished state: reading page with no margin and no request cards, contributors linked from the foot, open requests closed (FR-14.1). _(2026-09-15)_
7. [x] Proof-of-authorship export: PDF with title, author, chapter, section, word count, sha256 and timestamp (FR-13.6). _(2026-09-15)_

### Exit criteria

- [x] Import a real 80,000-word .docx with no heading styles, correct the proposed boundaries in under two minutes, export it back out with contributors intact. _Verified 2026-09-15 by `e2e/flow-7-import-and-export.spec.ts`, through the interface: a 20-chapter, ~80,000-word .docx with no styles anywhere is uploaded, read as 20 chapters "from a line that says chapter", corrected by hand (a chapter boundary removed, a chapter renamed, a section split), committed, and then exported as .md, .docx and .pdf — the Markdown carrying the corrected chapter names, the prose, and the source line FR-14.3 requires. The review-and-correct step is asserted to finish inside the two minutes._

### Notes

- **Import has one entry point and one shape.** Six formats become a
  `NormalisedDoc` of blocks, and everything downstream — the cascade, the
  section splitter, the review screen, the commit — reads only that. Adding a
  seventh format is one file in `packages/import/src/extract/`.
- **Mammoth does not carry page breaks**, whatever its style map says, so
  FR-3.3's fourth strategy reads them out of `word/document.xml` directly and
  matches them to blocks by text rather than by index (mammoth's output is not
  one element per `w:p`). `packages/import/src/extract/page-breaks.ts`.
- **Fountain is read by hand**, not with `fountain-js` as architecture §5 names.
  Decision 0015 records why, and what it costs.
- **Prose never round-trips through the browser.** The review screen sends back
  an outline of block indices; `commit` re-reads the file from storage and
  re-parses it. A tampered outline can rearrange somebody's own manuscript but
  cannot put words in it that were not in the file.
- **Storage has two drivers behind one interface.** R2 by presigned PUT when
  `R2_*` is configured, a `.uploads/` directory otherwise — so a contributor
  who clones this repository can run an import without a Cloudflare account,
  and so every exit criterion here is checkable on a laptop. The local endpoint
  does by hand what a presigned URL gets for free: a signed-in caller, writing
  only under their own prefix.
- **Export is an author's capability, not a reader's** (`storyboard:export` in
  the matrix, 16 capabilities × 4 roles = 64 cells). A reader can already copy
  what they read and FR-13.6 says so plainly; a one-click formatted download of
  somebody's unfinished novel is a convenience its author never asked us for.
  Spinning off is the reader's route to the words.
- **The review screen caught its own bug.** Joining a chapter to the one above
  moved only that chapter's first section and stranded the rest as a chapter
  nobody asked for. The flow test found it; `joinChapterWithPrevious` now moves
  the whole chapter.
- **.epub stays deferred** and is not offered anywhere, rather than offered and
  half-delivered.

---

## Phase 6 — Trust

**Goal.** The product holds under bad actors and careless ones, and a mistake cannot expose an unpublished manuscript.

**Resolved first:** OD-6 — **a co-author gets a bigger quota, not an exemption**
(decision 0016). Owner: no cap. Co-author: ten. Everyone else: three.

### Tasks, in order

1. [x] Quota, counted inside the submit transaction, in three tiers per decision 0016 (FR-13.2, architecture §6.1). `quotaFor()` lives beside the capability matrix. _(2026-09-15)_
2. [x] Global rate limits as a sliding window: 10 suggestions/day, 20 ideas/day, 3 ideas per request, 5 storyboards/day, 1 spin-off per storyboard per day, 20 reports/day, plus sign-up and verification resend (FR-13.3). In Postgres rather than Upstash — decision 0017. _(2026-09-15)_
3. [x] Community rules at `/rules`, a permanent URL, shown once on the sign-up screen and recorded on the account (FR-13.4). _(2026-09-15)_
4. [x] Reporting: user, storyboard, suggestion, idea; five categories; deduplicated per reporter and target; ten **upheld** reports suspend pending review; counts never public (FR-13.5). _(2026-09-15)_
5. [x] Admin at `/admin`: report queue with uphold/dismiss and an undo, reversible suspension, seeded-content manager with FR-15.4's targets, feature flags (FR-13.7, FR-15.5). _(2026-09-15)_
6. [x] The honest visibility copy on the import screen as well as the create screen, which was the one place it was missing (FR-13.6). _(2026-09-15)_
7. [x] `lib/authz` re-audited. The gap phase 1 left in writing is closed: the account's live status now reaches `can()` on every request (NFR-6). _(2026-09-15)_
8. [x] Purge job for storyboards past the 30-day grace, through the NFR-3 trigger's escape hatch in one transaction (FR-2.6). _(2026-09-15)_

### Exit criteria

- [x] A fourth submitted suggestion is refused with a clear message. _Verified 2026-09-15 by `e2e/flow-8-trust.spec.ts`: three go through the real composer and wait on the author; the fourth is refused with "You can have 3 suggestions waiting on this storyboard at once. Wait for a decision on one, or withdraw it."_
- [x] Ten upheld reports suspend an account. _Verified in the same file: nine upheld reports from nine different people (FR-13.5 deduplicates per reporter, so one person cannot do this alone), then a tenth filed through the real report control and upheld through the real admin queue. The account's `status` becomes `SUSPENDED`, it can no longer sign in, and — decision 0018 — a guest can still read its storyboard._
- [x] A private storyboard returns 404, not 403, to a signed-in stranger at every route including the API. _Verified in the same file across nine routes and the export endpoint._

### Notes

- **OD-6 resolved as three tiers** (decision 0016). The argument for the
  exemption as written — a co-author can edit directly, so capping their
  suggestions prevents nothing — proves less than it looks: the quota protects
  the owner's **attention**, not the manuscript. Ten is admittedly arbitrary, and
  it is one number in `lib/schemas/constants.ts`.
- **Suspension freezes the person, not the work** (decision 0018). FR-13.5
  suspends _pending review_, so nobody has decided anything yet; and the work is
  not only theirs — a credit sits on somebody else's contributors page. Hiding it
  would alter a third party's manuscript over an accusation against a stranger.
- **Phase 1 left a real hole, and this phase closed it.** `actorFrom` did not
  carry account status, so `can()`'s suspension check never fired: a JWT issued
  before a suspension kept writing for up to thirty days. The context now reads
  the account's live state once per authenticated request. The comment in
  `init.ts` that flagged this in phase 1 has been replaced by the fix.
- **Rate limits are in Postgres** (decision 0017), sliding rather than fixed —
  "ten in the last twenty-four hours", not "ten since midnight", because a fixed
  window lets somebody send ten at 23:59 and ten more at 00:01.
- **A refusal records nothing.** If a refused attempt wrote a hit, the window
  would slide forward every time somebody bounced off it and the limit would
  become permanent. There is a test for exactly this.
- **Upholding counts, filing does not.** A brigade can generate a hundred
  reports and suspend nobody; the ten in FR-13.5 are ten decisions by a person.
- **`server-only` is aliased under Vitest** (`apps/app/test/server-only.ts')
  so server modules can be tested without dropping the guard that keeps them out
  of client components. The alternative was to leave the import off the modules
  that need testing, which trades a real protection for a test-runner
  convenience.
- **Prettier will rewrite `\u0000` escapes inside a `/u` regex into literal
  control characters**, which turns the file binary. The control-character rule
  now has exactly one home, in `lib/schemas/help.ts`, and the report schema
  imports it.

### Audit, after phase 6

A read-through of the whole codebase, looking for leaks, holes and bugs rather
than for the next feature. Six findings, all fixed, each with a test that fails
without the fix.

1. **The purge job never ran.** `purgeDeletedStoryboards` nulled
   `Revision.parentId` by hand before deleting, and the NFR-3 trigger refuses
   _every_ UPDATE on `Revision` — the hard-delete hatch permits DELETE only. Every
   storyboard failed, the per-row `catch` logged it, and the job returned
   `{ purged: 0 }` looking like a quiet day. The unhooking was never needed:
   `parentId` and `restoredFromId` are already `ON DELETE SET NULL`. This was
   shipped in phase 6 with no test; it has four now.

2. **Purging a storyboard emptied its spin-offs** (decision 0019). `copyTree`
   shares revision rows, which is right inside a storyboard and wrong across
   two: a spin-off's sections pointed at the _original's_ revisions, and
   `Section.currentRevisionId` is `ON DELETE SET NULL`. So thirty days after an
   author deleted their storyboard, a cron job would silently empty every
   spin-off of it — to somebody who did nothing, with no record of why. FR-10.6
   says an author cannot delete somebody else's spin-off; this let them do worse.
   Spin-offs now copy revisions and remap their inherited credits.

3. **A suspended account could still write** through nineteen mutations. `can()`
   refuses a suspended actor, but a mutation that never loads a storyboard never
   reaches `can()` — creating a storyboard, committing an import, editing a
   profile. Every mutation is now `activeProcedure`, and
   `server/trpc/procedures.test.ts` reads the routers and fails if one is not.

4. **The sign-in page threw away where you were going.** `proxy.ts` puts the
   page a signed-out visitor wanted in `?next=`, and the sign-in action
   hard-coded `redirectTo: '/'`. FR-1.2's sixty seconds depends on not losing
   somebody's place. Fixed through `lib/safe-next.ts`, which is mostly a list of
   the ways a URL can point off-site — `//evil.example`, `/\\evil.example`, a
   scheme, a control character — because a sign-in page that redirects wherever
   it is told is an open redirect, and that is worth more to an attacker than
   most bugs here.

5. **Two rate limits counted refusals.** `storyboard.create` and `report.create`
   consumed a slot before validating their input, so a mistyped genre cost one of
   five storyboards a day. A limit should count what somebody did.

6. **`credit.forUser` was dead code with a weaker filter than its siblings** —
   it excluded private storyboards but not soft-deleted ones. Removed rather than
   fixed: nothing called it, and dead code with a subtly weaker guard is exactly
   what gets wired up later by somebody who assumes it is safe.

Also done while reading: `copyTree` moved out of the version router into
`server/tree.ts`. It is a data operation two routers need, and living in a
router meant importing it dragged the whole tRPC and Auth.js stack behind it —
which is why it had no test.

Checked and found sound: no `dangerouslySetInnerHTML` anywhere; the three raw
SQL statements are constants with no interpolation; the cron endpoint compares
its secret in constant time and fails closed; the weekly digest filters to
public, undeleted storyboards; `compare.revisions` enforces decision 0007's
pre-public history rule; and the sign-in error says the same thing whether or
not the address exists.

- Two things are deliberately not here: **account deletion** (OD-3's second
  half) needs the same purge machinery pointed at a person rather than a
  storyboard, and is better done next to OD-7's age policy in phase 7 — and
  `isAdmin` **has no interface**, because the first administrator has to be made
  in the database by whoever runs the deployment.

---

## Phase 7 — Launch

**Goal.** A stranger lands on the marketing site, reads a real stuck passage without an account, signs up, and sends a suggestion in under five minutes without asking anyone a question.

**Resolved first:** OD-7 — **13+, and no private messages, ever** (decision 0020).
OD-1 — **the rename is deferred**, with the full list of what it will touch
written down (decision 0021).

### Tasks, in order

1. [x] Seeds: 25 public-domain works across 8 genres, 40 open requests spanning all three kinds, 16 answered with accepted suggestions and credits; every one `isSeed` under the platform account, labelled _example_ on the reader and in browse (FR-15.1–15.4, FR-15.6). Idempotent: a second run creates nothing. _(2026-09-15)_
2. [x] Marketing site: the hero is a real stuck passage beside the suggestion that was accepted for it, both copied from the seed so the links go to the storyboard being described; two examples readable without an account; one call to action (FR-1.1). _(2026-09-15)_
3. [x] Community rules linked from the sign-up screen and the marketing footer, with the age policy added as a sixth rule (FR-13.4). _(2026-09-15)_
4. [x] Accessibility: the seeded surfaces carry real heading structure, every control has an accessible name, and the comparison marks were already not colour-only from phase 2 (NFR-4). Read below for what this does _not_ claim. _(2026-09-15)_
5. [x] Performance: the NFR-1 flow still passes against the seeded database — the reader never ships a whole manuscript, and chapter changes drop no frame. _(2026-09-15)_
6. [~] Rename per OD-1 — **deferred by decision 0021**, which lists what it will touch when it happens.
7. [x] Age policy per OD-7 (decision 0020): one checkbox at sign-up, no date of birth stored, and the reason that is enough said on the same screen. _(2026-09-15)_
8. [!] Backups and log dashboards — **blocked**: there is no hosting account to back up or to ship logs from.
9. [!] Flows against production — **blocked** for the same reason. They pass against a local production build, which is as close as this machine gets.

### Exit criteria

- [x] A stranger can land on the marketing site, read a real stuck passage without an account, sign up, and send a suggestion in under five minutes without asking you a question. _Verified 2026-09-15 by `e2e/flow-9-launch.spec.ts`: the seeded Pride and Prejudice request is read with no account, the visitor signs up and onboards through the real screens, opens the request from the margin card, and sends a 219-word suggestion that is accepted by the word bounds. The whole path takes the machine about four seconds; the criterion's five minutes is asserted as a ceiling._

### Notes

- **On the seeded excerpts.** They are transcribed into
  `packages/db/prisma/seed/storyboards/library.ts` rather than fetched, so the
  seed needs no network and is reproducible. **They should be checked against
  the Gutenberg editions linked beside each one before the traffic post.** A
  seeded example that misquotes the text it names is a small dishonesty on a
  platform whose pitch is trust, and the check is an afternoon.
- **The stuck points are the real work.** FR-15.1 says to seed the request side
  and not the helper side, so every `ask` and `preContext` in the library is
  written by hand for this product — 56 of them. The sixteen accepted
  suggestions exist only to show a visitor what the loop looks like when it
  closes.
- **Two bugs the seed found**, both fixed:
  - Every public storyboard told its readers "this storyboard was private
    until <date>" — including ones created public, where `publicFrom` is the
    creation time and there is no history before it. Decision 0007's banner now
    appears only when a revision actually predates `publicFrom`. This had been
    live since phase 2 and no flow asserted the banner's absence.
  - The age checkbox broke the shared sign-up helper, which would have hung
    every flow that creates an account. Caught by running the whole suite rather
    than the new file.
- **The database refused a bad seed, correctly.** `one_open_request_per_section`
  (FR-5.1) rejected a second open request on a section that already had one. The
  seeder now places each open request on the first free section, so the library
  can say where a stuck point _is_ without also solving the packing problem.
- **What task 4 does not claim.** Nobody has run this through a screen reader or
  an automated audit tool, and "WCAG 2.2 AA" is a conformance claim that needs
  both. What is true is narrower: headings are in order, controls have names,
  the manuscript is reachable by keyboard, and no information is carried by
  colour alone. A real audit belongs on the pre-launch list beside the restore
  drill.
- **Tasks 8 and 9 are blocked, not skipped.** A restore drill needs a backup to
  restore, and a production run needs a production. Both are account work and
  neither is code.

---

## Phase 8 — Into the world

**Goal.** A stranger on the internet can do what phase 7's exit criterion
describes. Today they cannot, because there is nowhere to do it.

**The honest framing.** Every task in this phase is account work or
configuration. Almost none of it is code, and the code that exists has been
waiting on it since phase 3. It is one week of a kind of work that cannot be
started until somebody with a credit card starts it.

**Resolve first:** nothing. This phase is unblocked the moment the accounts
exist.

### Tasks, in order

Marked `[x]` only where the work is actually finished. Everything still `[ ]`
needs an account, a DNS record, or a person with a screen reader — none of which
a commit can supply.

1. [ ] **Neon.** A Postgres 16 project with branch previews and daily backups at 30-day retention (NFR-8). Two connection strings, and they are not interchangeable: the pooled one is `DATABASE_URL`, the direct one is `DIRECT_DATABASE_URL` and is what migrations use, because DDL cannot run over a transaction-mode pooler. `packages/db/prisma.config.ts` prefers it; the application never reads it.
2. [ ] **Cloudflare R2.** One bucket, one access key, the four `R2_*` variables — **and the bucket's CORS rule**, which is the step that costs an afternoon when it is missed: the browser PUTs straight to R2, so the bucket has to allow the application's origin or every upload fails with an error that names nothing. The exact policy is in `docs/05-deployment.md`.
3. [x] **Deployment configuration.** `apps/app/vercel.json` and `apps/web/vercel.json` — build through Turborepo from the workspace root, plus the six cron entries. Note the plan limit: Vercel's Hobby tier allows two scheduled jobs at most once a day, and this product has six, one every ten minutes.
4. [x] **The build actually works on a host with no `.env`.** Turborepo runs in `strict` env mode and `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MARKETING_URL` and `CRON_SECRET` were not declared in `globalEnv`. Locally that is invisible, because `next.config.ts` loads the root `.env` itself. On Vercel there is no such file, so the first deployment would have failed on a required variable that was being filtered out — and, separately, a changed public URL would not have invalidated the build cache, which is how a deployment serves an old URL baked into the browser bundle.
5. [ ] **Resend**, a verified sending domain, and `EMAIL_FROM` on it. Start this early: the DNS wait is measured in hours.
6. [x] **A deployment cannot start half-configured** (decision 0022). `apps/app/src/env-preflight.ts`. Every one of the fallbacks that is right on a laptop is silently wrong on the internet — no mail key means every verification link goes to stdout and every new account is stranded, no cron secret means no digest ever runs, no object store on a serverless host means uploads land on a machine that goes away. None of them raised anything. Now a publicly reachable deployment refuses to start and names all of them at once.
7. [x] **The restore drill**, as a command (NFR-8). `pnpm db:drill "<url>"`. It checks that every migration is applied, that the invariants are really there — the immutability trigger and both partial unique indexes, which `prisma migrate status` cannot see and which a rebuilt database loses silently — that the tables hold rows, and that a whole storyboard reads out. It refuses any URL that is also `DATABASE_URL`. Verified in both directions against a copy of the development database: it passes on a good one and names exactly what is wrong with a damaged one.
   - [ ] **Run it against a real restored backup**, and write the date here. An undated drill did not happen.
8. [x] **The automated accessibility pass** (NFR-4). `apps/app/e2e/accessibility.spec.ts`, axe against WCAG 2.2 A and AA over the sign-up path, the reader, a request, the dashboard, the editor and the import screen. It found two systemic failures, both now fixed at the token level rather than instance by instance: `--color-ink-faint` was 2.98:1 on paper, failing 1.4.3 on every timestamp and byline in the product, and every link inside a run of text was distinguished from that text by colour alone (1.4.1) because the base style set `no-underline` and the components added `hover:underline`, which does nothing for somebody who is not hovering.
   - [ ] **The screen-reader pass**, which no test file can close. Until somebody has been through the reader, the editor and the request flow by ear, the product should not claim WCAG 2.2 AA — automated checking covers roughly a third of it.
9. [x] **The seeded excerpts are checked against the editions they cite** (decision 0023). `pnpm check-excerpts`. Thirteen of forty-five did not match: a wrong ebook number (Mrs Dalloway cited the 1923 short story while quoting the 1925 novel), five sentences closed with a full stop the author did not write, a dropped parenthetical in Jane Eyre, and a handful of moved words. All fixed, and the check passes on all forty-five.
   - Fixing the file turned out not to be enough: the seeder was idempotent by existence, so no correction could ever reach a database that had been seeded once. It now reconciles the text as a new revision, leaving contributors' accepted suggestions alone.
10. [x] **A 404, an error boundary, `robots.txt` and a sitemap.** The 404 matters more here than in most products: unpublished work answers 404 rather than 403 to a stranger, deliberately, so it is the front door of every private draft rather than a page people reach by accident. The sitemap takes its filter from `visibleStoryboardsWhere(null)` — the authorization layer's own definition of what a signed-out person may see — rather than writing a second one that could drift.
11. [x] **HSTS**, two years, subdomains included, no `preload` — a submission to a list baked into browsers is effectively irreversible and this product has not run long enough on this domain to promise that.
12. [x] **The flows can run against a deployment.** `PLAYWRIGHT_BASE_URL` was not supported: `baseURL` was hard-coded, so task 13 was not actually possible. With it set, nothing is built and no server is started.
13. [ ] **The 26 flows against production**, with `PLAYWRIGHT_BASE_URL` pointed at the deployed app. They sign up real accounts, so this is a deliberate act against a deployment you own. Then the traffic post.

### Exit criteria

- [ ] A person who has never seen this before, on their own device, on the public internet, reads a stuck passage and sends a suggestion.
- [ ] A backup taken today restores into a working database — `pnpm db:drill` against it, all five checks green, date recorded here.
- [ ] The digests arrive by email, from a domain that passes SPF and DKIM.
- [x] A misconfigured deployment refuses to start rather than pretending to work.
- [x] Every seeded quotation matches the edition it cites.
- [x] The automated accessibility pass is green, and what it cannot claim is written down.

### Notes

- This phase predicted it would need no code. It needed some, and the exceptions
  are the interesting part rather than a failure of the plan — each one was a
  thing that only shows up when you point the repository at the internet and
  look. Decisions 0022 and 0023 are the two that were worth writing down. The
  Turborepo `globalEnv` omission (task 4) is the clearest example of the note's
  own prediction coming true in reverse: something that worked locally _only_
  because a file was doing the work an environment variable should have done.

---

## Phase 9 — The gaps we left

**Goal.** Close the things that were deferred with a named home, before they
become the things nobody remembers were deferred at all.

**Resolve first:** OD-1 (the name), if it is going to be resolved. Decision 0021
lists what the rename touches; it gets more expensive with every external link.

### Tasks, in order

1. [ ] **Account deletion** (OD-3's second half). Phase 6 built erasure of a single contribution; deleting an account is the same machinery pointed at a person, and it is a legal obligation rather than a feature. The hard part is not the deletion — it is deciding what happens to storyboards they own that other people have contributed to, and that needs a decision record before any code.
2. [ ] **`.epub` export** (FR-14.2), deferred twice. `packages/export` already has the `Manuscript` shape and three formats built on it; epub is a fourth, and a zip.
3. [ ] **Upstash**, per decision 0017's own revisit trigger. The interface is `consume(key, limit, windowMs)` and a Redis driver is one file. Do this when a limit check shows up in a slow query log, not before.
4. [ ] **OAuth** (FR-1.6), which the SRS defers explicitly and says not to build the abstraction for early. One provider, and only if sign-up drop-off says people want it.
5. [ ] **The rename** (OD-1), if decided. Decision 0021 is the checklist.
6. [ ] **Revisit the marketing site's weight** (see OD-9 below). It ships about 560 KB of JavaScript that no part of the page uses, because it is a Next.js application containing one static page.

### Exit criteria

- [ ] A person can delete their account, and what happens to the work they leave behind is written down somewhere a stranger could read and agree with.
- [ ] Every format FR-14.2 names is available, or the SRS says plainly that it is not.

---

## Phase 10 — What writers ask for

**Goal.** Deliberately not planned here.

Everything above this line was specified before anybody used the product. Phase
10 is the first one that should not be, and writing a task list for it now would
be guessing dressed up as planning.

What it will be drawn from, when there is use to draw on:

- The deferred table in `01-srs.md` section 8 — real-time collaboration,
  full-text search, mobile writing, licence verification — each of which has a
  reason for waiting that use might or might not overturn.
- What the report queue actually fills up with, which will say more about what
  the community rules should have said than any amount of thinking will.
- Where people stop. The sign-up funnel, the request that never gets an answer,
  the suggestion that never gets a decision.

The one thing to resist is building the deferred list because it is written
down. Every item on it was deferred for a reason that is still in the table
beside it.

---

## Every phase, every pull request

- `pnpm check-vocabulary`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Schema change → migration + seed update.
- New procedure → authz decision at the data layer + a matrix test if a new cell is touched.
- Socially significant event (accept, pass, restore, spin-off, report, suspend) → structured log line with an `event` field.
- User-facing copy in sentence case; buttons name their consequence.
- This file updated: tick the task, note the date, record any deviation.

## Open decisions

| OD    | Question                                                 | Blocks                 | Status   | Decision                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1  | The name (domain taken; crowded in film)                 | Phase 7                | deferred | Decision 0021 — phase 7 ships as Storyboard; the rename is a find-and-replace whenever the name is chosen, and what it touches is written down.                                                                                                                                                                                                      |
| OD-2  | Helping under a pen name separate from the account       | Phase 3                | open     | —                                                                                                                                                                                                                                                                                                                                                    |
| OD-3  | Contributor's right to delete their credit record (GDPR) | Phase 4                | open     | —                                                                                                                                                                                                                                                                                                                                                    |
| OD-4  | Hide history written while private after going public?   | Phase 1                | open     | Schema carries `publicFrom` for "hide"; drop it if the answer is "expose everything".                                                                                                                                                                                                                                                                |
| OD-5  | One "helped" idea per request, or unlimited              | Phase 2                | open     | —                                                                                                                                                                                                                                                                                                                                                    |
| OD-6  | Co-author quota exemption across storyboards             | Phase 6                | closed   | Decision 0016 — a bigger quota (10), not an exemption. Owner uncapped, everyone else 3.                                                                                                                                                                                                                                                              |
| OD-7  | Under-16 policy and adult-to-minor messaging             | Phase 7 (not optional) | closed   | Decision 0020 — 13+, one checkbox, no date of birth stored, and no private messages anywhere in the product, ever.                                                                                                                                                                                                                                   |
| OD-8  | What is searchable in an unpublished manuscript          | Phase 10               | open     | Full-text search is in the deferred table for a privacy reason, not a technical one. Somebody has to say what a stranger may search inside work nobody has published.                                                                                                                                                                                |
| OD-9  | Whether the marketing site should be a Next.js app       | Phase 9                | open     | One static page currently ships ~560 KB of framework JavaScript it never uses. Plain HTML, or a static-site generator, would be a fraction of that — against the cost of a second toolchain.                                                                                                                                                         |
| OD-10 | A Content-Security-Policy, and what it costs             | Phase 9                | open     | The application renders prose that strangers wrote and has no CSP. A strict one needs a nonce threaded from the proxy through the layout, which is a real change with a real chance of breaking a screen quietly — so it wants its own deliberate pass rather than being bolted onto a deployment phase. HSTS and the other headers are already set. |

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
