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

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase**        | 14 — Complete the product. Every item of `06-completion-plan.md` was worked, and its final pass (section 11) was run on 2026-10-24 but not finished: the walk of every item stopped after section 6. The results and the owner's hand-over are in section 11. Phase 10 (one measurement, the Washington clean-up) and phase 12 (the screen-reader pass, OD-7, OD-9) keep their owner-only items open. 13 stays driven by use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **State**        | Live in Singapore with R2, backed up nightly and drilled weekly (decision 0033). The last commit, `21b986a` (milestones 1 to 6, 2026-10-18), is on the remote. Nobody has checked whether production applied its migrations and serves it. **Milestones 7, 7b, 8, 9 and 10 (2026-10-24) are in the working tree, uncommitted**, with eight new migrations. Final pass (2026-10-24), on a fresh local PostgreSQL 16: CI's eight steps green, with **981 tests in 107 files** (601 in 50 at the baseline) and **85 browser flows** (83 desktop, 2 phone; 37 at the baseline). The flows' three failures were faults of the tests, corrected and passed again. The plan scores 98.5% (130 done, 4 partly done: 6.7, 6.8, 6.10, 6.15) and P1 100% (72 of 72). Both are provisional, because only section 6 was re-walked before the account's usage limit stopped the reviews. The spec has 100 of 101 features done (FR-12.4 partly), and 7 of 9 NFRs met (NFR-1 and NFR-4 partly). **Migrations production needs**: apply them with `pnpm db:deploy` before pushing. It applies only what is missing, and the build refuses to deploy without them. The twenty-five of milestones 1 to 6, committed in `21b986a`: `20261018003000_version_tombstone` (item 1.1, additive), `20261018020000_idea_reply_notification` (item 1.9, an enum value), `20261018021000_suggestion_opened_at` (item 1.10, additive), `20261018022000_suggestion_withdrawn_notification` (item 1.10, an enum value), `20261018023000_unblock_request_states` (item 1.12, data only: existing "help me think" requests take the state their ideas give them), `20261018024000_retired_usernames` (item 1.6, additive), `20261018030000_roles` (item 2b.1, additive: the `Role` enum and `User.role`, backfilled from `isAdmin`, with the `one_admin` index), `20261018031000_sub_admin_grants` (item 2b.3, additive: the grants table), `20261018032000_last_seen` (item 2b.4, additive: `User.lastSeenAt`), `20261018033000_account_standing` (item 2b.5, additive: `User.bannedAt` and `User.standingNote`), `20261018034000_banned_names` (item 2b.6, additive: `RetiredUsername.reason`, `name` and `note`), `20261018035000_hidden_after_report` (item 2.7, additive: `hiddenAt`, `hiddenById`, `hiddenReason` on `Storyboard`, `Suggestion` and `Idea`), `20261018036000_user_blocks` (item 2.9, additive: `UserBlock`), `20261018037000_terms_accepted` (item 2.3, additive: `User.termsAcceptedAt`), `20261018038000_sessions_ended` (item 3.3, additive: `User.sessionsEndedAt`), `20261018039000_email_change_tokens` (item 3.2, additive: `EmailChangeToken`), `20261018040000_user_avatars` (item 3.13, additive: `UserAvatar`, the profile picture as bytes; decision 0048), `20261018041000_default_visibility` (item 3.15, additive: `User.defaultVisibility`), `20261018042000_google_sign_in_state` (item 3.16, additive: `User.googleLinkedAt`, backfilled for confirmed accounts with no password, and `User.googleDisconnectedAt`), `20261018043000_request_edits` (items 6.1 and 6.2, additive: `ContributionRequest.characterNotes` and `editedAt`), `20261018044000_suggestion_edited` (item 6.7, additive: `Suggestion.editedAt`), `20261018045000_idea_edits` (item 6.8, additive: `Idea.editedAt` and `deletedAt`), `20261018050000_calendar_counts_help` (item 6.13, data only: empties `ActivityDay` and rebuilds it from suggestions sent and top-level ideas posted on other people's stories, as UTC days; decision 0049), `20261018051000_request_opened_at` (item 6.15, additive: `ContributionRequest.openedAt`, backfilled from `createdAt`; the first nightly `purge` after it closes every request open longer than thirty days and tells its author, decision 0050), `20261018052000_request_auto_closed_notification` (item 6.15, additive: the `REQUEST_AUTO_CLOSED` notification type). The eight of 2026-10-24, uncommitted: `20261024010000_last_written` (item 7.6, additive: `Storyboard.lastWrittenAt`, backfilled, kept by a trigger on every new revision), `20261024011000_version_events` (item 7.10, additive: `VersionEvent` and its enum), `20261024012000_publications` (item 7b.1, additive: `Version.frozenAt` and `Publication`), `20261024013000_spin_off_published_notification` (item 7b.4, an enum value), `20261024200000_server_errors` (item 10.1, additive: `ServerError`; decision 0051), `20261024201000_digest_bookkeeping` (item 10.6, additive: a partial index on the email queue and `User.weeklyDigestSentAt`), `20261024202000_audit_events` (item 10.2, additive: `AuditEvent`), `20261024400000_restore_reason` (item 8.14, additive: `Revision.restoreReason`, with `revision_immutable()` replaced so it is pinned too). New dependency (milestones 1 to 6): `sharp` in the application, which the framework already shipped. New command: `pnpm admin:grant <email> --production` sets the one administrator. New optional environment variable: `SUPPORT_EMAIL` (item 2.5); with it unset, the sender's address is used. Nothing new of these kinds on 2026-10-24. Decisions written that day: 0051 and 0052, and 0044 amended. The next is 0053. |
| **Review**       | 2026-10-17, the code against `01-srs.md`, `02-architecture.md` and the prototype. Of the 100 numbered features, about 80 are fully built, about 19 partly and 1 not started (FR-8.6). Of the 9 NFRs, 5 are met and 4 partly (NFR-1, 4, 5, 7). Judged 70–75% ready for strangers. Every gap it found is an item in `06-completion-plan.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Last updated** | 2026-10-24                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Next actions** | 1. Finish the final pass: walk items 1.1 to 5.8 and 7.1 to 10.7 as section 11 of `06-completion-plan.md` says, then fix the five medium defects it still lists for section 6. The sixth, a removed idea's words still sent to every reader, was fixed on 2026-10-24. 2. Owner: commit the working tree. Before pushing, apply the eight 2026-10-24 migrations, and whichever of the twenty-five production lacks, with `pnpm db:deploy`. Run `pnpm admin:grant <your email> --production` once, if not done yet. 3. Owner: read the sixteen new seeded stuck points, then run `pnpm db:seed` against production once. 4. Owner: read section 4 of the terms and the privacy page's new lines. A legal review before launch is recommended. 5. Owner decisions, listed in the plan's owner list: FR-12.4's digest action; seeded requests closing by themselves after thirty days; removing the seeds once there are real members (D-14); whether the account export includes kept events; and D-3's wording. 6. NFR-1: the reader's first contentful paint under Fast 3G is about 1.5 s, against 1.2 s. 7. The screen-reader pass, by a person (NFR-4, phase 12). 8. Carried over: a warm signed-in page timed from India (phase 10); OD-7, OD-9 and the domain (OD-1), which Resend and the digest's SPF/DKIM wait on; deleting the Washington database; and the Dependabot pull requests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Overview

| Phase | Name                   | Requirements                                                                                | Estimate              | Status                                                            |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| 0     | Foundations            | FR-1.3 (steps 1–2), FR-1.4, FR-1.6, NFR-3, NFR-8, NFR-9                                     | 1 week                | `[x]` complete, CI green 2026-09-14                               |
| 1     | Write something        | FR-1.2, FR-1.3 (steps 3–4), FR-2, FR-4, FR-8.2–8.4, FR-11.1 (part), NFR-5, authz core       | 2 weeks               | `[x]` committed, CI green                                         |
| 2     | The loop               | FR-5, FR-6, FR-7, FR-8.1, FR-8.5, FR-9.1–9.2, NFR-2, NFR-7                                  | 3 weeks               | `[x]` committed, CI green                                         |
| 3     | Findable and durable   | FR-1.5, FR-9.3–9.6, FR-11, FR-12                                                            | 2 weeks               | `[x]` committed, CI green                                         |
| 4     | Versions and spin-offs | FR-10, FR-7.5                                                                               | 2 weeks               | `[x]` committed, CI green                                         |
| 5     | Import and export      | FR-3, FR-14                                                                                 | 2 weeks               | `[x]` committed, CI green                                         |
| 6     | Trust                  | FR-13, FR-15.5, NFR-6                                                                       | 1.5 weeks             | `[x]` committed, pushed                                           |
| 7     | Launch                 | FR-1.1, FR-15.1–15.4, NFR-1, NFR-4, OD-1, OD-7                                              | 2 weeks               | `[x]` committed, pushed                                           |
| 8     | Into the world         | NFR-8, and every blocked task from phases 0–7                                               | 1 week                | `[~]` all but the domain and a stranger                           |
| 9     | The gaps we left       | FR-14.2 (.epub), FR-1.6, OD-3 (second half), decision 0017                                  | 2 weeks               | `[x]` the last two moved to phase 12                              |
| 10    | Fast in production     | NFR-1, from the first week of real use                                                      | 1 week                | `[~]` code done, measuring                                        |
| 11    | Finish production      | NFR-8, FR-3.1 in production, phase 8's account half                                         | 1 week                | `[x]` 2026-10-15                                                  |
| 12    | Draftboard, and launch | OD-1, OD-7, OD-9, NFR-4, the audit                                                          | 1 week                | `[~]` audit done; the rest is the owner's                         |
| 13    | What writers ask for   | Driven by use, not by this plan                                                             | open                  | `[ ]`                                                             |
| 14    | Complete the product   | The 2026-10-17 review, across FR-1 to FR-15 and NFR-1, 4, 5, 7, 8 (`06-completion-plan.md`) | 131 items and 3 setup | `[~]` all worked 2026-10-24; final pass not finished; uncommitted |

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
- [ ] Hosting: two Vercel projects (`apps/app`, `apps/web`), Neon database with branch previews, daily backups with 30-day retention (NFR-8). _Account work, not code. See the hosting checklist below. The database became Prisma Postgres, without branch previews (decision 0028)._

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

**Resolved first:** OD-7 — **no private messages, ever** (decision 0020). The
age gate that decision also introduced was removed in phase 9 (decision 0026),
which reopens OD-7 in a narrower form.
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

1. [ ] **Prisma Postgres**, in place of Neon (decision 0028). Two connection strings on two hosts, and they are not interchangeable: `pooled.db.prisma.io` is `DATABASE_URL`, `db.prisma.io` is `DIRECT_DATABASE_URL` and is what migrations use, because DDL cannot run over a transaction-mode pooler. `packages/db/prisma.config.ts` prefers it; the application never reads it. The `prisma+postgres://` URL beside them is Prisma Accelerate and is refused.
   - [x] Created through Vercel's storage integration. _(2026-10-13)_
   - [x] Guardrails, now that `.env` names the live database: test runs keep off a hosted `DATABASE_URL`, local `pnpm e2e` refuses one, and `migrate dev`, `migrate reset` and `db push` refuse one. `prisma.config.ts` also fell back from an empty `DIRECT_DATABASE_URL` with `??`, so a copy of `.env.example` could not run a migration. _(2026-10-13)_
   - [x] The two strings in `.env`: the pooled host as `DATABASE_URL`, the direct host as `DIRECT_DATABASE_URL`. _(2026-10-13)_
   - [x] `pnpm db:deploy`, `pnpm db:seed`, `pnpm check-deploy`. Rehearsed on a throwaway local database first. Live: 11 migrations, 26 storyboards, 3 accounts with no password; a second seed run changed no row, and the app served the sitemap and the storyboards locally without writing anything. _(2026-10-13)_
     - The first live seed failed twice, and both are fixed. A session-level `SET` made through the pooled host — by a throwaway counting script, not the repository — stuck to one shared server connection and made it read-only; it was reset on every pooled connection and verified. Then the seed's transactions outran Prisma's 5 s default at about 300 ms a round trip from the laptop; the seed now allows 120 s (`prisma/seed/index.ts`). The application keeps the default, which is why the function region has to match the database's.
   - [x] `DATABASE_URL` in the Vercel project, Production only: a preview would otherwise write to the live database. And the function region set to the database's. _Done in phase 10, task 7: Production only, `sin1` beside the Singapore database._
   - [x] Backups that meet NFR-8. Free has none and Starter or Pro keep 7 days, so it is Business or a daily `pg_dump` kept for 30 days. _A nightly encrypted `pg_dump` with a 30-day expiry: phase 11, task 2._
2. [x] **Cloudflare R2.** _Done in phase 11, task 1._ One bucket, one access key, the four `R2_*` variables — **and the bucket's CORS rule**, which is the step that costs an afternoon when it is missed: the browser PUTs straight to R2, so the bucket has to allow the application's origin or every upload fails with an error that names nothing. The exact policy is in `docs/05-deployment.md`.
3. [x] **Deployment configuration.** `apps/app/vercel.json` and `apps/web/vercel.json` — build through Turborepo from the workspace root. The six cron entries moved to `.github/workflows/cron.yml` on 2026-10-13 (decision 0030): Hobby fails any deployment whose crons run more than once a day.
   - [x] **The Vercel projects, configured from the API** _(2026-10-13)_. `draftboard` (the app): root directory `apps/app`, Next.js, function region `iad1`, the same as the database; 13 Production-only variables, with fresh `AUTH_SECRET` and `CRON_SECRET`, and `ALLOW_INCOMPLETE_DEPLOYMENT=1` until R2. Its production domain is `draftboard-cyan.vercel.app` — `draftboard.vercel.app` belongs to another team. `storyboard` (marketing): its two public URLs were unset, so every sign-up link on the live site pointed at `localhost:3200`; set, redeployed, and checked.
   - [x] **The app's previews are skipped** _(2026-10-13)_. The first push deployed Production cleanly, then every Dependabot pull request built a preview of the app that failed on the variables Preview deliberately does not have. `ignoreCommand` in `apps/app/vercel.json`, and the same command on the project so open branches stop too.
4. [x] **The build actually works on a host with no `.env`.** Turborepo runs in `strict` env mode and `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MARKETING_URL` and `CRON_SECRET` were not declared in `globalEnv`. Locally that is invisible, because `next.config.ts` loads the root `.env` itself. On Vercel there is no such file, so the first deployment would have failed on a required variable that was being filtered out — and, separately, a changed public URL would not have invalidated the build cache, which is how a deployment serves an old URL baked into the browser bundle.
5. [~] **Email.** Resend with a verified sending domain, or SMTP (decision 0029). _SMTP is live; Resend waits on a domain._
   - [x] SMTP through Gmail as `alerts.draftboard@gmail.com` with an app password: `server/mail/smtp.ts`, the preflight accepts either provider, and `pnpm check-deploy` logs in or, with `--email`, sends through the production code. A test message was sent and accepted. _(2026-10-13)_
   - [x] The `SMTP_*` variables and `EMAIL_FROM` in the Vercel project, then one real sign-up from the deployment. _The owner's sign-up on 2026-10-14 (phase 11, task 4): the email arrived, in spam._
   - [ ] Resend and a domain, before the weekly digest outgrows Gmail's roughly 500 recipients a day. _Blocked on choosing a domain (OD-1)._
6. [x] **A deployment cannot start half-configured** (decision 0022). `apps/app/src/env-preflight.ts`. Every one of the fallbacks that is right on a laptop is silently wrong on the internet — no mail key means every verification link goes to stdout and every new account is stranded, no cron secret means no digest ever runs, no object store on a serverless host means uploads land on a machine that goes away. None of them raised anything. Now a publicly reachable deployment refuses to start and names all of them at once.
7. [x] **The restore drill**, as a command (NFR-8). `pnpm db:drill "<url>"`. It checks that every migration is applied, that the invariants are really there — the immutability trigger and both partial unique indexes, which `prisma migrate status` cannot see and which a rebuilt database loses silently — that the tables hold rows, and that a whole storyboard reads out. It refuses any URL that is also `DATABASE_URL`. Verified in both directions against a copy of the development database: it passes on a good one and names exactly what is wrong with a damaged one.
   - [x] **Run it against a real restored backup**, and write the date here. An undated drill did not happen. _2026-10-14, run 38612022623 (phase 11, task 3); weekly since._
8. [x] **The automated accessibility pass** (NFR-4). `apps/app/e2e/accessibility.spec.ts`, axe against WCAG 2.2 A and AA over the sign-up path, the reader, a request, the dashboard, the editor and the import screen. It found two systemic failures, both now fixed at the token level rather than instance by instance: `--color-ink-faint` was 2.98:1 on paper, failing 1.4.3 on every timestamp and byline in the product, and every link inside a run of text was distinguished from that text by colour alone (1.4.1) because the base style set `no-underline` and the components added `hover:underline`, which does nothing for somebody who is not hovering.
   - [ ] **The screen-reader pass**, which no test file can close. Until somebody has been through the reader, the editor and the request flow by ear, the product should not claim WCAG 2.2 AA — automated checking covers roughly a third of it. _Moved to phase 12, task 3._
9. [x] **The seeded excerpts are checked against the editions they cite** (decision 0023). `pnpm check-excerpts`. Thirteen of forty-five did not match: a wrong ebook number (Mrs Dalloway cited the 1923 short story while quoting the 1925 novel), five sentences closed with a full stop the author did not write, a dropped parenthetical in Jane Eyre, and a handful of moved words. All fixed, and the check passes on all forty-five.
   - Fixing the file turned out not to be enough: the seeder was idempotent by existence, so no correction could ever reach a database that had been seeded once. It now reconciles the text as a new revision, leaving contributors' accepted suggestions alone.
10. [x] **A 404, an error boundary, `robots.txt` and a sitemap.** The 404 matters more here than in most products: unpublished work answers 404 rather than 403 to a stranger, deliberately, so it is the front door of every private draft rather than a page people reach by accident. The sitemap takes its filter from `visibleStoryboardsWhere(null)` — the authorization layer's own definition of what a signed-out person may see — rather than writing a second one that could drift.
11. [x] **HSTS**, two years, subdomains included, no `preload` — a submission to a list baked into browsers is effectively irreversible and this product has not run long enough on this domain to promise that.
12. [x] **The flows can run against a deployment.** `PLAYWRIGHT_BASE_URL` was not supported: `baseURL` was hard-coded, so task 13 was not actually possible. With it set, nothing is built and no server is started.
13. [x] ~~**The 26 flows against production**~~, with `PLAYWRIGHT_BASE_URL` pointed at the deployed app. _Replaced by decision 0034: the seven `@deployed` tests plus the owner's walk-through, both done in phase 11, task 4._

### Exit criteria

- [ ] A person who has never seen this before, on their own device, on the public internet, reads a stuck passage and sends a suggestion. _The owner's to arrange: one invited stranger._
- [x] A backup taken today restores into a working database — `pnpm db:drill` against it, all five checks green, date recorded here. _2026-10-14, phase 11, task 3._
- [ ] The digests arrive by email, from a domain that passes SPF and DKIM. _Blocked on a domain (OD-1)._
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

Scope was chosen deliberately rather than by working down the deferred list:
account deletion and `.epub` are the exit criteria, and the other three were
picked by the product owner. Two of those three — OAuth and Upstash — the SRS
and decision 0017 both say to wait on until real use says otherwise. They are
built anyway, behind their existing interfaces, so they cost nothing while they
are unused and are ready when the data arrives.

1. [x] **Account deletion** (OD-3's second half, decision 0024). The person is erased; the writing stays, shown as "a former member". The `User` row survives with every identifying column destroyed — it is the anchor every revision, credit and storyboard points at, and deleting it would take other people's work with it, which is exactly the spin-off failure decision 0019 caught. Seven days' grace, during which the account is frozen but can still sign in to stop it, because an account somebody else got into can be destroyed in one click.
2. [x] **`.epub` export** (FR-14.2), deferred twice. A zip of XHTML with a manifest; the awkward parts are all in the container — `mimetype` first and stored uncompressed, or a strict validator rejects what most software opens.
   - Finding: `formatsFor` was a hand-written list, so `.epub` existed, worked, passed every test, and no writer could have asked for it. It is derived from `EXPORT_FORMATS` now, with a test that keeps it derived.
3. [x] **Upstash** (decision 0017's own revisit). An Upstash sliding window over a sorted set, through `fetch` rather than a client library. Postgres is still the default and the revisit trigger is unchanged: set the variables when a limit check shows up in a slow query log. When Redis fails, `consume` falls back to Postgres rather than allowing the action.
4. [x] **A Content-Security-Policy** (OD-10, decision 0025). Enforcing, with a per-request nonce and `strict-dynamic`. `style-src` allows `'unsafe-inline'` deliberately and the record says why: CSP governs style _attributes_, a nonce cannot authorise one, and the contents editor sets a transform that changes every frame.
   - The proxy's matcher had to become every document, so the route list it used to be moved into `lib/protected-routes.ts` with a test asserting both directions — that the reader is still open to guests, and that `/newsletter` is not `/new`.
5. [x] **Google sign-in** (FR-1.6, decision 0027). One provider, no abstraction, inert until configured. Linking is by _verified_ email only — matching an OAuth identity to an account on an unverified address is an account-takeover vector, and Auth.js will happily do it if you set the option whose name says not to. It chooses no username: a Google display name is not a permanent public identity somebody picked.
6. [x] **The age gate removed** (decision 0026). Not planned; asked for mid-phase. The checkbox was client-side only — never sent, never stored — so nothing on the server changed. OD-7 is open again in a narrower form, and the half of decision 0020 that does the protecting (no private messages, ever) stands.
7. [x] **The rename** (OD-1) — deferred again, deliberately. _Done in phase 12, task 1._
8. [x] **The marketing site's weight** (OD-9) — not in scope for this phase. _Moved to phase 12, task 4._

### Exit criteria

- [x] A person can delete their account, and what happens to the work they leave behind is written down somewhere a stranger could read and agree with — decision 0024, and the deletion screen says it before the button.
- [x] Every format FR-14.2 names is available. `.epub` was the last one, and the SRS no longer says it is missing.

---

## Phase 10 — Fast in production

**Goal.** The deployed application answers as quickly as the work it does
allows. Planned on 2026-10-13 from the first real use, when the owner found it
slow to load and an email 2–5 minutes late.

**Measured first** (decision 0031), against draftboard-cyan.vercel.app from India:

| What                     | Before                                                                             | After, in Singapore (2026-10-13)                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A warm request           | ~0.27 s, nearly all of it the trip to Washington and back                          | A storyboard page in 0.19–0.20 s over an open connection, 0.35–0.8 s over a new one; first byte in a browser 0.15–0.19 s. Every response `bom1::sin1`: Mumbai's edge, Singapore's function |
| A cold start             | 6.5 s, paid by every new instance                                                  | 1.2 s and 1.4 s, the two seen. In the slower, the first three database calls took ~650 ms each: the new instance's first connection                                                        |
| One view of a storyboard | ~10 server renders at once: tab links, plus an edit and a history link per section | None on view (signed out); hovering a link renders that link only                                                                                                                          |
| Sign-up                  | 53 s inside the request before Gmail had the email; delivered 2–5 min later        | Under 0.5 s inside the request, all three attempts on 2026-10-14 (no `trpc.slow` line); Gmail accepted the email 2.2 s after the response. It was delivered to **spam**                    |

How the after column was taken: `curl` from a laptop in India for requests, a headless Chromium for the page, and the deployment's runtime log for `instance.start` and `trpc.slow`. How the before column was taken was not written down, so the warm figures are not strictly comparable; the cold start and the prefetches are.

### Tasks, in order

1. [x] **Timing in the logs.** `instance.start` once per cold start, `trpc.slow` for any call over 500 ms with its path, `mail.sent` / `mail.failed` with milliseconds and provider. _(2026-10-13)_
2. [x] **Links prefetch on intent, not on sight.** `components/link.tsx`, in all 43 files that used `next/link`, with a lint rule against importing it directly. _(2026-10-13)_
3. [x] **Heavy libraries load on first use**, not with every cold start of the tRPC route: the AWS SDK, mammoth and the XML parser, Resend, nodemailer, Argon2. `@storyboard/import/types` is the importer's light entry point. _(2026-10-13)_
4. [x] **A pool sized for serverless.** Five connections per instance, a ten-second wait before failing instead of forever, idle connections kept a minute; `sslmode=verify-full`, which silences node-postgres's warning on every cold start. _(2026-10-13)_
5. [x] **The verification email goes after the response** (`afterResponse`, decision 0031). The form answers at once; a failed send is logged and the page already offers another link. _(2026-10-13)_
6. [ ] **Deploy and measure again**, the same four numbers, and write them here. Three of four measured, 2026-10-13; sign-up waits on an account to make. Before the deploy, locally: 453 unit and database tests, the production build, and all 33 browser flows pass; 461 tests after the move's, with the database suites against a local Postgres. _(2026-10-13)_
7. [ ] **Move to Singapore** (decision 0032): a Prisma Postgres database in `sin1`, created by the owner; migrations and a copy of every row; the function region set to `sin1`; `DATABASE_URL` swapped; the old database kept until the new one is proven.
   - [x] **The database.** Created by the owner in Singapore through Vercel (prefix `prisma_sin_`). Migrated; 405 rows in 24 tables copied from Washington, every table identical by checksum; the restore drill passed on the copy. The root `.env` names it, with Washington's strings kept as comments. The drill had refused it at first: every Prisma Postgres database is `db.prisma.io:5432/postgres`, and the drill told databases apart by host, port and name alone. `sameDatabase` now compares the login too (decision 0032). _(2026-10-13)_
   - [x] **Vercel**, in one go, through its API: `DATABASE_URL` (Production) set to the new pooled string, and the function region to `sin1` (`resourceConfig.functionDefaultRegions`; the API refuses it alongside the older `serverlessFunctionRegion`, which follows by itself). They take effect with the next deployment. _(2026-10-13)_
   - [x] **The push**, then proof. Deployed `c3c6cf4` at 15:28 UTC; the deployment's regions are `[sin1]`, its first `instance.start` logged `region: sin1`, and the two databases compared identical after the switch, all 24 tables. A second instance logs `bom1`: that is `proxy.ts`, which Vercel runs at the visitor's edge, and which reads only the session cookie, never the database. _(2026-10-13)_
   - [ ] **Washington removed**, after a clean week: disconnected from the project, deleted in the Prisma Console, its strings taken out of `.env`.
   - [x] **`pnpm db:copy`**, for the move and any after it (`packages/db/scripts/copy-database.ts`). No superuser needed: rows go in parent first by their actual foreign-key values, the two nullable columns that close a cycle are filled in last, and `Revision` — which a trigger forbids updating — is ordered row by row. One transaction, then a checksum of every table on both sides. It refuses a non-empty target, a target on different migrations, and a copy onto itself. Rehearsed twice locally: 380 seeded rows, then 1,741 rows left by the browser flows (a spin-off, 351 section heads, revisions from suggestions, import JSON) — every table identical, and the restore drill passes on the copy. _(2026-10-13)_
8. [ ] **What the measurements in 6 point at.** `trpc.slow` names the procedures; the likely work is query count on the reader and the dashboard. Two leads from the first measurement: a new instance's first database calls take ~650 ms (`user.genres`, `browse.requests`, `browse.storyboards` on `/browse`), and the reader's client-side batch of four calls (`spinOff.lineage`, `spinOff.listFor`, `section.listForChapter`, `request.listForStoryboard`) took 1.1 s once after the page loaded. A third, possibly: on 2026-10-15 the functions all started in `sin1`, while the proxy started in `iad1` and `sfo1` as well as `sin1`. Task 7 found the proxy runs at the visitor's edge, so those may simply be visitors in America. But one `POST /signin` in `iad1` fell during the owner's own sign-in attempts. Unconfirmed, and unmeasured.

### Exit criteria

- [x] Cold start under 3 s, from `instance.start` and the first response. _1.2 s and 1.4 s, 2026-10-13._
- [ ] A warm signed-in page under 1 s from India. _Signed out it is 0.2–0.8 s; signed in is not measured yet._
- [x] Sign-up answers in under 2 s. _Under 0.5 s, three times, 2026-10-14: none crossed the 500 ms `trpc.slow` line._
- [ ] Every number measured on production and written above.

---

## Phase 11 — Finish production

**Goal.** Nothing running on `ALLOW_INCOMPLETE_DEPLOYMENT`, and a backup that
has been restored.

### Tasks, in order

1. [x] **Cloudflare R2.** The owner opens the account; the bucket, an access key scoped to it, the CORS rule, the four `R2_*` variables on Vercel. Then `ALLOW_INCOMPLETE_DEPLOYMENT` comes off. _Account open with R2 enabled, 2026-10-13._
   - [x] **The bucket and its key**, made by the owner and put in `.env`. `pnpm check-deploy` wrote, read and deleted an object with it; the key is refused on any other bucket name, which a key made for every bucket would not be. _(2026-10-14)_
   - [x] **The CORS rule**, proven rather than assumed. The doctor said it could not be checked from a shell; it can, by sending the preflight a browser sends against a presigned upload URL. It now does, for `NEXT_PUBLIC_APP_URL`'s origin and any `--origin`. Production and `localhost:3200` are allowed; an origin the rule does not name gets 403. _(2026-10-14)_
   - [x] **Vercel**, through its CLI: the four variables in Production, the key and secret as Sensitive; the two plain ones read back and compared equal to `.env`. `ALLOW_INCOMPLETE_DEPLOYMENT` removed. They take effect with the next deployment. A redeploy from here was refused by the permission check, as a production deploy, so the push is the deploy. _(2026-10-14)_
   - [x] **An import on production**, once deployed: the first upload that goes to the bucket from a browser. _The owner's, 2026-10-15 at 16:04 UTC; see task 4._
   - [x] **What R2 changed underneath.** An import that was never committed kept its upload forever. That was harmless while uploads went to a serverless instance's temporary disk, and became a stranger's whole manuscript kept indefinitely the day R2 was switched on. The daily `purge` job now removes any import a day after its last change, file then row, and keeps the row if the store refuses (`purge/imports.ts`, four tests, one checked to fail without the fix). `deleteObject` reports failure instead of swallowing it, so the account purge's "could not remove" log can finally fire, and it logs a key's directory, never the file name. Vitest and the browser flows blank `R2_*` as they blank mail: with the bucket in `.env`, flow 7 would have uploaded to production. _(2026-10-14)_
2. [x] **A nightly encrypted backup** (NFR-8, decision 0033). A GitHub Actions job runs `pg_dump` over the direct host, encrypts it, and writes it to a bucket of its own with a 30-day expiry rule, through a token of its own: the application's key, which a compromised server would hold, should not be able to delete the backups. Prisma's Free plan keeps no snapshots, so this is the backup.
   - [x] **Built**: `.github/workflows/backup.yml`, `packages/db/scripts/backup.sh` and `restore.sh`. PostgreSQL 17 client tools, `verify-full` TLS, GnuPG AES-256 with a passphrase, one object per run named to the minute, its size read back. _(2026-10-14)_
   - [x] **Rehearsed locally**: `pg_dump` 17.10 of the seeded database, restored into an empty PostgreSQL 17, and the drill passed, in full and with `--quiet`. A wrong passphrase was refused at decryption; a second restore into the full database was refused at its first `CREATE` and changed nothing. Two things only the rehearsal could find: a dump of the `public` schema re-creates `public`, which every database already has, so `restore.sh` skips those two entries; and a dump from 17 does not restore into 16. _(2026-10-14)_
   - [x] **The account side**, by the owner: the bucket `draftboard-backups` with its lock and lifecycle rules, a token for it alone, the passphrase kept outside GitHub, four secrets and two variables in the repository. `pnpm check-deploy --backup-bucket draftboard-backups`: the application's key is refused there. _(2026-10-14)_
   - [x] **The first run**, by hand, run 38610958898 at 17:56 UTC: dump, check, encrypt, upload, size read back, every step green. _(2026-10-14)_
3. [x] **The restore drill, for real.** Last night's dump into a throwaway database, then `pnpm db:drill`. Dated here. **2026-10-14, run 38612022623 at 18:04 UTC:** the newest backup (17:56) fetched, decrypted, restored into an empty PostgreSQL 17 in one transaction, and `pnpm db:drill --quiet` passed. From now on the workflow does this every Sunday on the newest backup, and fails if that backup is over 36 hours old. `--quiet` is new: the drill printed row counts and a storyboard's title, and this repository's Actions logs are public.
4. [x] **The flows against production**, with a plan for the accounts they create. **Replaced** by decision 0034: the flows cannot pass against a deployment (they read the verification email from a file only a local server writes, so each sign-up would email an undeliverable address and fail), and some write to `DATABASE_URL` directly, which on the owner's laptop is production.
   - [x] **Safe against any deployment**: `pnpm e2e` with `PLAYWRIGHT_BASE_URL` now runs only tests tagged `@deployed`, which visit pages and write nothing. Seven pass against production: axe on the public pages, the reader and an open request; the policy's nonce in header and markup; no violation on any public page; scripts that run. _(2026-10-14)_
   - [x] **The owner's walk-through**: a real sign-up read in a real inbox, and one manuscript imported, timed from the live logs. That is also task 1's last item and phase 10's sign-up measurement.
     - [x] **The sign-up**, 2026-10-14 at 19:24 UTC. Fast (under 0.5 s), and the email arrived — in spam. It found two real faults first. The owner's first try was an address that already had an account: the form said a link was on its way, and the server sent nothing, by design, so the owner waited for an email that was never coming. And that path always answered "sent" where a new address answers "cooldown" to a second request inside a minute, so two requests told a stranger whether an address was registered. Now an address with an account gets "You already have a Draftboard account" with a sign-in link, and every kind of address, on sign-up and on resend, answers in the same one-minute rhythm (`inQuietCooldown`). Four tests, three of them checked to fail on the old code. The form now says a message is on its way, of either kind, and to look in spam. _(2026-10-15)_
     - [x] **The import.** Done by the owner on production, 2026-10-15, and it worked: a `.docx` uploaded to R2 from the browser at 16:04:29 UTC, analysed in 1.29 s (one `trpc.slow` line for `import.analyse`; chapters found from heading styles, 1 chapter, 124 words), and committed to a new story at 16:05:01 after the owner reviewed it. No error in the logs. The owner's first try, on 2026-10-14, failed: the upload was signed, and never arrived. The SDK signs for `<bucket>.<account>.r2.cloudflarestorage.com` by default, the policy's `connect-src` named `<account>.r2.cloudflarestorage.com`, and the browser refused the upload as another origin. The screen said "Failed to fetch". Nothing had tested the two together: the CORS check sent only a preflight, and the doctor's round trip went through the SDK. Fixed 2026-10-15: uploads are signed path-style, on the endpoint the policy already names (`lib/r2.ts`, shared by storage, the policy and the doctor); `r2.test.ts` signs a real URL and asks the real policy about it, and fails without the fix; the doctor reads each origin's policy too; and the screen says the file could not be sent instead of "Failed to fetch". Proven before the push with the real bucket: the 83,240-word flow-7 manuscript went from a browser on `localhost:3200` to R2, back to the server, and into a story, and the bucket was empty afterwards. _Then the owner imports once on production._
   - [x] **Show password**, asked for by the owner: a Show/Hide button on the sign-in and set-password fields (`components/password-input.tsx`). Its full name, "Show password", is hidden text rather than `aria-label`, so it never becomes a second label that answers to "Password". Readable passwords are not spell-checked, corrected or capitalised. Flow 1 shows and hides one. _(2026-10-15)_
   - [x] **Forgot password**, asked for by the owner (FR-1.7, decision 0036): "Forgot your password?" on sign-in, a one-hour single-use link, the new password typed twice, then signed out everywhere and signed in again. Reset tokens have their own table. A reset ends every session that signed in before it, by `passwordChangedAt` against a sign-in time the token carries (`authAt`, not `iat`, which Auth.js rewrites). The "already have an account" note now offers the reset too. Ten router tests, the link claim checked to fail without its guard, five on the session rule, and flow 11 through the browser, including a second device signed out by the reset. Known: a device signed out this way that opens a protected page logs one `Error: redacted` from the page's refused prefetch, while the person is redirected to sign in. _(2026-10-15; the migration reached production after the code did, task 5)_
5. [x] **The outage of 2026-10-15, and what let it happen.** _Fixes deployed in `eca8e1f` at 16:02 UTC; the Vercel build ran the new check ("Migrations: all 12 applied"); CI green on its second attempt, after a Google Fonts failure (phase 12, task 5)._ `4a654b5` was pushed before `20261014223653_password_reset` was applied. From that deploy, shortly after 18:35 IST, until 21:10 IST, every sign-in, every sign-up and every signed-in page on production failed on the missing `User.passwordChangedAt`. The owner found it by trying to sign up. The migration was applied at 21:10 IST, after which `prisma migrate status` reported nothing pending, the failing full-row lookup ran clean on the pooled connection, and a sign-in probe against production was refused as `CredentialsSignin` with no new errors in the logs. Three faults made it possible or made it worse. Each is now fixed and tested:
   - [x] **Nothing stopped the deploy.** The order "migrate, then push" was only written down. The app's build now runs `db:check-migrations` first (`packages/db/scripts/check-migrations.ts`, `turbo.json`), and fails, naming the missing migrations, if the database lacks one that the code ships. On Vercel, a failed build leaves the live deployment serving. Verified against production (all 12 applied) and against a probe migration it lacked (refused, exit 1). _(2026-10-15)_
   - [x] **The sign-up form showed Prisma's own message** to whoever was signing up. The tRPC error formatter passed through the text of any error. An `INTERNAL_SERVER_ERROR` now reads "Something went wrong on our side, not yours" in the browser, and is still logged in full by the route (`server/trpc/init.ts`, `errors.test.ts` through the real fetch handler, checked to fail on the old formatter). `settings.updateGenres` threw a plain `Error` for an unknown genre, which this would have hidden; it is a `BAD_REQUEST` now, as in the other two routers. _(2026-10-15)_
   - [x] **Sign-in said "That email and password do not match" for every failure**, so a database fault told the owner a correct password was wrong, five times running. Google refusals said it too. The page now keeps Auth.js's error type and says the fault is ours unless the password was actually refused (`lib/sign-in-error.ts`, with tests). _(2026-10-15)_

### Exit criteria

- [x] The preflight passes with no override. _The deployment of `22a5dc7`, built without it, 2026-10-14._
- [x] A dated restore drill from a real backup. _2026-10-14, task 3._
- [x] ~~The flows green against production.~~ The `@deployed` tests green against production (done), and the owner's walk-through (decision 0034). _Both done, 2026-10-15._

---

## Phase 12 — Draftboard, and launch readiness

**Goal.** Ready for people who are not the owner.

### Tasks, in order

1. [ ] **The rename to Draftboard** (OD-1, decided 2026-10-13). Every name a person sees: page titles, emails, the sender, the marketing site, metadata. Package names and internals stay. One question to settle first: whether the thing a writer makes is still called a storyboard. _Settled by the owner on 2026-10-14: it is a **story** (decision 0035)._
   - [x] **The interface**: 73 strings in 38 files, each changed on its own line by a script that refused to write unless it found exactly the text it expected. "Story" where it meant the thing a writer makes, "Draftboard" where it meant the product. The wordmark, the title template, the dashboard, the rules, settings, the reader, the history and lineage pages, server error messages, report labels, the verification email, the marketing page, "Written on Draftboard" in every export, and the proof PDF's label. _(2026-10-14)_
   - [x] **Kept out for good**: the vocabulary linter bans `storyboard` in interface copy, beside `merge` and `commit`, and no longer mistakes a `case` label for copy. Two tests. Server code is outside its reach, so error messages, mail and export were swept by hand. _(2026-10-14)_
   - [x] **Around the code**: `EMAIL_FROM`'s name in `.env`, `.env.example` and on Vercel (read back, equal); `draftboard` reserved as a username; the README. The seeded platform account is `draftboard-examples`, "Draftboard examples", and the seed's library pass now keeps its username, name and biography current on every run. A re-seed of a database seeded as Storyboard renamed it in place. _(2026-10-14)_
   - [x] **On production**: deploy, then `pnpm db:seed` once against it to rename the platform account. _Deployed in `eca8e1f`. The seed ran on production at 17:53 UTC on 2026-10-15, and not on purpose. The permission check had refused it from here earlier that day, rightly, as a write to production the owner had not approved. Later, while updating this file, tracker text containing the command in backticks was put in a double-quoted shell string; the shell ran it, against the `.env` database, which is production. It did what the seed always does and nothing else: the example account became `draftboard-examples`, "Draftboard examples", the genres were confirmed, and no story, request or excerpt was created or changed ("0 created, 25 already present, 0 requests"). Confirmed by a read afterwards. A crawl of 60 live pages before it had found "Storyboard" only in that account's name._
2. [x] **The audit**, as after phase 6: the whole codebase, not the diff. _2026-10-15._ Five read-only reviews in parallel: sign-in and accounts; access and data exposure; files, mail and scheduled work; failure paths and races; schema, scripts and deployment. Each finding was then checked against the code before anything changed: about 45 distinct, after duplicates. All fixed but two, each with a test, and every test that could run against the old code was run against it and failed there, except the two noted. Decision 0037 records the two new rules. The ones that mattered most:
   - **High.** A deleted story that had ever accepted a suggestion could never be purged: deleting the suggestion nulled `Revision.suggestionId`, an UPDATE the immutability trigger refuses, so it failed every night and kept the prose for good (FR-2.6). Suggestions and revisions now go in one statement. Sign-in had no rate limit at all. Every auth email was limited per address only, so one script could exhaust Gmail's daily quota and stop every real sign-up. A 160-byte `.fountain` file hung an import for hours (exponential backtracking in the title-page pattern); a `.docx` of self-closing paragraphs did the same, quadratically; a zip whose headers understate its size got past the bomb guard. `import.commit` took jobs nobody had analysed, files swapped after analysis, and outlines that wrote the whole manuscript 250,000 times. One failed or slow email left every notification in the run unmarked, so the next run sent them all again. Joining a section twice put its text in twice. A draft reopened over a co-author's newer text replaced it. The last edit before leaving the editor was reported as saved and was not. Closing a story's requests skipped every request with an answer waiting, and closed requests went on taking suggestions.
   - **Medium.** An old confirmation link set a new password silently (decision 0036 says it never can). Asking two auth forms in turn told a stranger whether an address had an account. A suspended or deleting admin kept every power. The session token copied "onboarded" and the username from the browser. Accounts without a username could write, and one that asked to be deleted before choosing one was never erased. Public profiles announced suspensions, against decision 0018. Erasing a contribution missed copies of copies. Suggestions sent while a story was private became public with it, against decision 0007. Every head move (save, restore, split, join) checked before its transaction and wrote unconditionally. Removed sections took new text, and accepted suggestions could land in them. Raw validation JSON reached forms. Daily limits were spent by refusals. Accept, pass, withdraw and "helped" could race into contradictions or two credits. A long note in a language without spaces was a server error. Large imports, spin-offs and purges outran Prisma's five seconds.
   - **Low**, and the rest of FR-13.3's edges: `RateLimitHit.key` could not hold a long address; Google linking left the address unconfirmed; `pnpm cron` had been broken since phase 9 and had no production guard; the seed's own usernames were free to take; cron results went to public Actions logs; the marketing site could build with localhost links; 25 genres against a hard-coded 24; private titles in a contributor's lists; the authorship proof for a story they can no longer see; exports during the deletion grace; concurrent import commits; a chunked upload read whole; withdrawing left a request "answered"; notification failures reported as action failures; four failures that showed nothing; bounds copied out of `constants.ts`.
   - **Not fixed, recorded.** The notification queue has no index on its own query (M15): it needs a migration, and the table is small; ship it with the next one. The weekly digest keeps no record of who was sent it, so a run repeated by hand sends it twice (H6b): that needs a column. Runs can no longer overlap (`cron.yml`) and a failure no longer aborts the run, which removes the ways it happened on its own.
   - **Races not reproduced.** Two of the race tests passed against the old code too (two commits of one import, accept against pass): the timing did not land. The fixes rule them out by construction (a conditional claim in the transaction), and the tests stay as guards.
   - **Found while verifying.** A Playwright accessibility test had never reliably scanned a request page: its link was chosen by name and, for a guest, led to sign-in. It now follows a request's own link. And the per-client limits first counted every local browser flow as one client; loopback is now "no address" (decision 0037).
3. [ ] **The screen-reader pass.** A person, not a test file.
4. [ ] **The open decisions**: OD-7 (age policy), OD-9 (the marketing site's weight), OD-8 if search comes up.
5. [x] **Every build fetches its fonts from Google**, and fails if Google answers in the wrong shape. _Fixed 2026-10-16, after it happened again: the production build of `4856aa5` failed the same way on Archivo, and production stayed on the deployment before it. The three typefaces are now in the repository (`packages/ui/fonts`, 13 files, 348 KB, with their OFL licences), and `@storyboard/ui/fonts.css` is what `next/font` generated, kept: the same Google files, the same `unicode-range` subsets, the same size-adjusted fallback faces, the same `--font-*` variables, so nothing on screen changes. The builds no longer touch the network for fonts. Dropped: `next/font`'s preloads, which fetched Courier Prime on every page. `e2e/fonts.spec.ts` (`@deployed`) checks the faces load from the site itself, and fails with the stylesheet removed (checked)._ The history: CI on `eca8e1f` (2026-10-15) failed in `@storyboard/web` with "next/font/google queries have exactly one entry" on all twelve Newsreader faces. The CSS arrived, so Google answered, and Turbopack could not parse a single font URL in it. Google sometimes serves `fonts.gstatic.com/l/font?kit=…&skey=…&v=v26` instead of `/s/newsreader/v26/….woff2` (a `text=` request gets that shape every time), and Turbopack splits its internal font query on the `&`. The same commit built cleanly on Vercel and here, and nothing in it touched `apps/web`. Re-running clears it; self-hosting the three families (OFL) removes it, at the cost of doing by hand the subsetting and fallback metrics `next/font/google` does now.

### Exit criteria

- [x] No user-visible "Storyboard" left that means the product. _The example account was the last; renamed on production 2026-10-15 (task 1)._
- [x] The audit's findings fixed or recorded. _2026-10-15, task 2._
- [ ] The screen-reader pass done, dated, and its findings fixed.

---

## Phase 13 — What writers ask for

_This was phase 10 until 2026-10-13, when phases 10 to 12 were inserted ahead of it. Decision records written before then call it phase 10._

**Goal.** Deliberately not planned here.

Everything above this line was specified before anybody used the product. Phase
10 is the first one that should not be, and writing a task list for it now would
be guessing dressed up as planning.

### From use, so far

- [x] **Accepting "what comes next" erased the section's opening** (2026-10-16, the owner's first test of the loop between two accounts). Every accepted suggestion replaced the section (FR-8.1), right for a rewrite and wrong for a continuation. Now a continuation is added after the text, and the comparison before accepting shows that (decision 0038, `server/accepted-text.ts`). A router test reproduces the owner's case and fails on the code that was live.
- [x] **History could not show what a version changed.** The panel still carried phase 1's placeholder ("the side-by-side view arrives with the comparison engine"). The engine arrived in phase 2 and was never wired in here; phase 2's notes did not catch it. Each version now has "What changed" (against the one before it) and "Compare with current", in the same comparison view the suggestion screen uses. Flow 2 now opens it in a browser.

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

## Phase 14 — Complete the product

**Goal.** Close every gap the review of 2026-10-17 found: the spec's
half-built requirements, the bugs that lose someone's work, and what a finished
product needs that the SRS never listed, of the kind "forgot password" was.
This phase is not phase 13. It is driven by a reading of the code, not by use.

`06-completion-plan.md` holds the items (118 at planning; 131 after the
owner's additions of 2026-10-18: roles and an admin panel, decision 0043,
and publishing, decision 0044), the working loop, the owner's decisions, and
the final pass that re-checks every item and re-scores the product. This
section records only where the phase stands.

**Started out of order.** The owner started this phase on 2026-10-18, while
phases 10 and 12 keep their owner-only items open.

### Notes

- **FR-5.9, read for "help me think" requests (item 1.12, 2026-10-18).** The
  requirement defines `answered` as "has ≥1 undecided suggestion" and
  `resolved` as "a suggestion was accepted", and says nothing about ideas, so an
  unblock request stayed `open` for ever. It is now read as: an unblock request
  is `answered` once it has an idea answer, which is a top-level idea from
  somebody who is not one of the story's authors, and `resolved` once an idea
  is marked as having helped. The author's own ideas and every reply are
  conversation, not answers, so they move nothing and do not take the request
  out of the seven-day nudge. Browse, the request lists and the nudge all use
  this one definition (`server/answers.ts`).

### Exit criteria

- [x] Every P1 item in `06-completion-plan.md` is `[x]`. _(2026-10-24: 72 of 72, provisional until the walk is finished.)_
- [~] Every P2 and P3 item is `[x]`, or dropped or deferred with a reason the owner agreed. _(2026-10-24: 55 of 59; 6.7, 6.8, 6.10 and 6.15 are partly done.)_
- [~] The final pass (section 11 of the plan) is done, and its scores are written in both files. _(2026-10-24: run, and written in both files; the walk stopped after section 6.)_
- [x] CI's exact steps are green, and every browser flow passes, desktop and mobile. _(2026-10-24: green on a fresh database; the three flows that failed were faults of the tests, corrected and passed again.)_
- [x] The owner has the list of migrations, environment variables, seeds and actions that production needs. _(2026-10-24: section 11 of the plan, and the Current position above.)_

---

## Spec review, 2026-10-16

**Why.** The owner's first two-account test found the "continue" accept
erasing an opening and a history screen that had never shown a comparison.
Both were built to plan and both had been ticked off. So the plan itself was
traced into the code, requirement by requirement, by five read-only reviews:
FR-1 to 4, FR-5 to 8, FR-9 to 12, FR-13 to 15 with the permissions matrix
cell by cell, and the architecture, NFRs, screens and placeholders. Every item
below marked _verified_ was checked against the code afterwards; the rest are
the reviews' findings, recorded with their file and line, to be confirmed
when they are worked on.

**What this says about the tracker.** "Everything else in the SRS is
implemented" (Audit before deployment, below) was not true. Several phases
ticked a requirement off when the server half existed and the screen did
not: spin-offs, deleted-story restore, proof of authorship, lifting a
suspension, the history comparison. From here, a requirement is done when a
person can do it in the browser, and a browser flow does it.

**Migrations from this review, for `pnpm db:deploy`:** `20261016120000_draft_base_revision`, `20261016130000_request_reopened_notification`, `20261016140000_private_spans`. All additive; the build guard refuses to deploy the code until they are applied.

### A. Bugs that damage work or break a core flow

Each gets a test that fails without the fix.

- [x] **Formatting-only edits are thrown away and reported "Saved"** (_verified_). The no-change check compares a hash of the plain text (`section.ts:578-588`), so italics, a quote, a scene break or a heading count as no change, and the draft holding them is deleted. _Fixed 2026-10-16: the check compares the stored document, so a mark is a change; integrity test._
- [x] **A quote holding anything but paragraphs fails every save** (_verified_). TipTap's blockquote allows any block (`tiptap.ts:97`); the stored schema allows paragraphs (`schema.ts:51-54`). Scene break inside a quote, Quote on a heading, or a pasted quoted heading: every save fails until undone. _Fixed 2026-10-16: the editor's quote holds paragraphs only, as the stored schema does._
- [x] **A reopened draft is never saved** (_verified_). The editor counts changes from the draft it opened on, so Save now, blur and leaving all see nothing to save (`section-editor.tsx`). _Fixed 2026-10-16: an editor that opens on a draft starts with one unsaved change._
- [x] **Typing on after "changed a moment ago" brings the overwrite back.** The 2026-10-15 fix compares the draft's time with the head's; a draft saved after the conflict looks current. The draft needs to record the revision it was written on (`SectionDraft`, a migration). _Fixed 2026-10-16: `SectionDraft.baseRevisionId` (migration `20261016120000_draft_base_revision`, existing drafts backfilled to the judgement they had); `section.get` decides `behind`; the editor never lets a draft save and a commit overlap; integrity test._
- [x] **A stale suggestion cannot be sent again** (_verified_; caused by the 2026-10-15 fix that stopped sending to answered requests). Staleness only follows an accept, which resolves the request. FR-6.7's re-send must work on a resolved request, without spending the daily limit or the per-story quota. _Fixed 2026-10-16: a suggestion sent once may be sent again to a resolved request, spending neither the daily limit nor the quota; integrity test._
- [x] **An accepted suggestion's page compares it with the text after it was accepted**, showing nothing changed (or a continuation added twice) and "Accepting it will replace the current text" (`compare.ts:238-263`). _Fixed 2026-10-16: an accepted one shows the text before it against the revision it made; integrity test._
- [x] **"What changed" fails on an alternate version's first edit** (_verified_; the 2026-10-16 wiring). Its parent is the main draft's revision, in another section row, and `compare.revisions` refuses pairs across sections. Same lineage should be allowed. _Fixed 2026-10-16: pairs are matched on lineage within one story; integrity test._
- [x] **A second accepted continuation is stacked after the first.** FR-6.8: written against the old head, it replaces the first unless rebased. A continuation should be added after the text it was written against (its base), not the current head (decision 0038 to amend). _Fixed 2026-10-16: added after its base revision; decision 0038 amended; integrity test._
- [x] **Every permanent address in credit lines 404s** (_verified_): `/s/{slug}/c/{n}/{m}` has no page (`credit.ts:103`), though SRS §4 lists it. _Fixed 2026-10-16: `/s/{slug}/c/{n}` and `/s/{slug}/c/{n}/{m}` open the reader at the chapter, scrolled to the section. Also found: credit addresses and the reader's Edit and History links were built from stored `order` values, not reading positions, and a joined-away section kept its old address; now positions, and a credit follows a join to the section that took its words. Integrity test, flow 4._
- [x] **Most notifications lead nowhere** (_verified_). Received, accepted, passed, stale, idea helped, request closed and contribution removed store only ids; the in-app list and emails need the story's address and the request's (`notification-list.tsx:11-18`, `digests.ts:62-71`). The author's "a suggestion arrived" email links to `/notifications`, where the row has no link and no title. _Fixed 2026-10-16: `server/notification-targets.ts` works out each row's link and title when it is read, for the list and the emails alike, against what the recipient may read now, so old rows are mended and a story made private names nothing. Integrity tests, a digest test, flow 4._
- [x] **Every rate limit can be beaten in parallel** (_verified_). `consumePostgres` counts, then inserts, unlocked (`limits/index.ts:72-92`): 30 simultaneous creates make about 30 stories against 5. _Fixed 2026-10-16: a transaction-scoped advisory lock per key before the count (8 of 12 got through against 5 before; now 5). The Redis limiter adds before it counts and takes the hit back when over. Limits tests._
- [x] **A finished story's requests can be reopened or opened**, server-side, and then appear in browse (`request.ts:72,396`, `browse.ts:27`). _Fixed 2026-10-16: `assertNotFinished` in `request.create`, `request.reopen` and a re-send; browse excludes finished stories; the request page offers no reopen. Integrity test._
- [x] **Promoting a version strands its open requests** on the demoted draft; accepting from one writes into the alternate under "Accept into the main draft" (`version.ts:156-169`). _Fixed 2026-10-16: promotion moves each open request to the same lineage in the new main draft, closing (and telling) those with nowhere to go; a request can no longer be opened or reopened on an alternate; deleting an alternate closes requests on its sections. Integrity test._
- [x] **Deleted prose survives in the comparison cache** (_verified_): `DiffCache` stores paragraph text and nothing deletes it (`compare.ts:84`), so the purge (FR-2.6) leaves the words behind. _Fixed 2026-10-16: the purge deletes every cached comparison of the revisions it removes. Purge test._
- [x] **Restore only ever turns credits off**: restoring an accepted text back leaves its credit not live (`section.ts:737-750`); and credit liveness is judged per section row, not per main draft. _Fixed 2026-10-16: liveness is judged by lineage in the main draft only, and restoring an accepted text back turns its credit on again. Also found: the history listed revisions by section row, so an alternate version's history was empty and a promoted draft's showed only its own edits; it now follows the chain the current text stands on (decision 0014), and restore accepts any version on it. Integrity tests._
- [x] **Two accepts at once**: the second gets a serialization failure, shown as a server fault rather than FR-6.6's sentence; and "accept anyway" is a plain flag, not tied to the head the author saw (`suggestion.ts`, `decision-panel.tsx`). _Fixed 2026-10-16: a serialization failure is FR-6.6's sentence, and accepting a stale one names the head the author saw (`acknowledgedHeadId`); integrity tests._
- [x] **Closing a request by hand** notifies nobody and leaves its waiting suggestions "waiting" for good, holding the helpers' quota (FR-5.10: "marked as not accepted"). _Fixed 2026-10-16: goes through `closeRequest`, which tells everyone with a draft or a suggestion waiting; what was waiting reads "not accepted" and holds no quota, but keeps its state, so reopening puts it back in front of the author. Integrity test, unit test._
- [x] **Drafts and withdrawn suggestions count as answers**: a request someone only opened a draft on shows "1 suggestion", leaves "No answers yet", and is never nudged (`browse.ts`, `request.ts:256`, `digests.ts:421`). _Fixed 2026-10-16: `server/answers.ts` defines an answer (sent, not withdrawn) for browse, the request lists and the quiet nudge. Integrity test._
- [x] **Inherited spin-off credits count as the contributor's own**: double counts on the profile, and credit lines naming the spin-off's owner (`profile.ts`). _Fixed 2026-10-16: the profile and credit lines use a contributor's own credits; the spin-off's contributors page still names them. Counts are counted, not taken from the page of 100. Profile test._
- [x] **Reopening a request** sends "the section you helped with changed" to everyone, drafts and the accepted writer included (`request.ts:434-446`). _Fixed 2026-10-16: a fourteenth notification type, `REQUEST_REOPENED` (migration `20261016130000_request_reopened_notification`), to everyone who ever sent something and nobody who only drafted; reopening happens once however many clicks. Integrity test._
- [x] Smaller: a duplicate report spends a daily report, and two at once is a server fault (`report.ts:47-54`); the history says "private for part of its life" past 50 revisions (`section.ts:657`); profile counts stop at 100; the admin gauge counts OPEN only; `?version=` with a bad id is a 500 on export; a section of exactly 150 words takes a continue request (FR-5.7); two links to a `/dashboard` that does not exist; the word count opens at 0 (_verified_, fixed 2026-10-16); the scene-break shortcut is not bound (_verified_, fixed 2026-10-16: Mod-Enter); a lone `#` in Markdown becomes a chapter; quotes vanish when importing a screenplay; a guest is offered "Report", and on `/browse` sees Settings and Sign out but no Sign in. Found while fixing these: a session ended by a password reset that opens `/settings` is sent to sign in, as it should be, but the page's prefetch fails first and the server logs it as an error (flow 11). _All fixed 2026-10-16, each with a test: a duplicate report is free and two at once are one; the history notice compares visible versions with the chain; profile counts are counts; the admin gauge counts open as OPEN and ANSWERED, answered as RESOLVED, targets in `SEED_TARGETS`; a stray `?version=` is a 404; exactly 150 words takes no continue request; the dashboard links go to `/`; a lone `#` is a scene break; Final Draft character references (`&#8220;`) are decoded, which is what the "vanishing quotes" were, with an entity-bomb test alongside; a guest is offered "Sign in to report" and, on `/browse`, Sign in and Create an account; and the account pages settle the session before prefetching, so an ended session no longer logs a server error._
- [x] **Two not-found messages** ("That storyboard does not exist." against "That story does not exist.") tell hidden from absent, and put a banned word on screen (`lib/authz/index.ts:165`, `guard.ts:67`). _Fixed 2026-10-16: one constant, `STORY_NOT_FOUND`, for both. Matrix test._

### B. Built on the server, never connected

Small each; a screen or a link.

- [x] Undo a story deletion within the 30 days (`storyboard.restore`, no caller; deleted stories vanish from the dashboard; restore unfinishes a finished story). _Done 2026-10-16: the dashboard lists deleted stories with "Bring it back" and the date each goes for good (`storyboard.listDeleted`); restore brings a finished story back finished; deleting now closes its requests and tells their helpers. Integrity test._
- [x] Lift a suspension (`admin.setUserStatus`, `admin.user`, no screen). _Done 2026-10-16: "Suspended accounts" on the moderation screen (`admin.suspended`), each with "Lift the suspension". Flow 8._
- [x] Start a spin-off: the only button is on `/lineage`, which nothing links to for a story never spun off. _Done 2026-10-16: "Your own version" in the reader's header leads to it. Flow 6 now follows the link instead of typing the address._
- [x] Proof of authorship (FR-13.6): the route exists, nothing links to it, and no screen now shows a hash. _Done 2026-10-16: each version in the history shows its fingerprint, and its writer gets "Proof that you wrote this (PDF)"; the proof's address is the section's place in the main draft (`server/places.ts`), not its stored order. Flow 2 fetches the PDF._
- [x] The unread count beside Notifications (`notification.unreadCount`); a resend button after sign-up (`auth.resendVerification`); naming sections (`section.rename`); discarding a draft (`section.discardDraft`); resuming an analysed import after a reload (`import.getProposal`); "already reported" (`report.mine`); a helper's own list (`suggestion.listMine`). _Done 2026-10-16: the count is in the header; "Send it again" after sign-up; sections are named on the contents screen (flow 7); a draft can be thrown away, from the editor holding it (which stands its saves down first) or beside an overtaken one; an analysed import survives a reload (`/import?job=`, flow 7); "You have already reported this" replaces the form (flow 8); "Your suggestions" lists everything sent (flow 3)._
- [x] The rights note is stored and exported but never shown, and spin-offs do not copy it (FR-14.5). _Done 2026-10-16: shown on the reader as the author wrote it; a spin-off quotes its original's note in its lineage banner rather than copying it into its own author's field._
- [x] A story's genres cannot be changed after creation (the server accepts them; the form never sends them). _Done 2026-10-16: genre picker in story settings._
- [x] "An idea arrived" is never sent (`IDEA_RECEIVED`; `idea.post` notifies nobody). _Done 2026-10-16: `idea.post` notifies the authors, never the poster (`server/notify-authors.ts`). Integrity test._
- [x] The composer (screen 9) shows neither the section's text nor the pre-context, so a continuation is written blind to the opening it follows. _Done 2026-10-16: "The story so far" and the section ("What yours will follow" for a continuation, open by default) above the composer. Flow 3._
- [x] History (FR-8.3, 8.4, 8.6): "restored from 12 Sep", more than 50 versions, compare any two, chips on restore. _Done 2026-10-16: "restored from 12 Sep", "Show older versions" (paged), and "Compare" on any two. FR-8.6's optional chips on restore are not built: there is nowhere yet to keep or show a reason. Integrity test, flow 2._
- [x] An exported spin-off never names the story or author it came from. _Done 2026-10-16: every format says "Spun off from …" under the author, naming a private original only as such. Export test._

### C. In the plan, never built

Larger. Each wants a decision on whether, and when.

- [x] **Co-authorship** (SRS 3.2's whole co-author column, FR-9.1's COAUTHOR credit, two notification types, architecture §6's invite / accept / remove). Nothing creates a `Collaborator`, so no one can be a co-author; the private-story copy still promises "the people you invite". Decision needed: build it, or take the promises out. _Built 2026-10-16 (owner: build it): `coauthor` router (invite by username, accept, decline, take back, remove, leave; three at most, invitations included; ten invitations a day), the COAUTHOR credit on accepting, both notifications with links, "Co-authors" for a story's authors, "Invitations" with a dashboard banner. Integrity test, flow 12 (a private story, two accounts, the co-author writes)._
- [x] **Screenplay writing in the editor** (FR-4.2): no way to make a scene heading, character or dialogue line; they arrive only through import, and a new screenplay is written as prose. _Built 2026-10-16 (owner): decision 0040. An Element menu, and Enter, Tab, Shift-Tab and Escape, in the editor and the suggestion composer; the reader sets any script in Courier Prime. Flow 13._
- [x] **The quiet-request nudge's two actions** (FR-12.4): widening the word bounds has no procedure, and the digest takes only requests from the last 7 days, so a nudged request can never be in it. _Owner, 2026-10-16: not built now; the email says what is true instead (still open, listed under "No answers yet", close and ask again for a wider range). Digest test._
- [x] **Alternate version against the main draft** (FR-7.5's third case): a list of sections, no comparison view. _Built 2026-10-16 (owner): each rewritten section opens into the same comparison (`components/revision-comparison.tsx`). Flow 6._
- [x] **Import review** (FR-3.2, 3.4, 3.5, 3.7): boundaries cannot be moved, a split always cuts the middle, confidence is one phrase for the whole manuscript, blank-line runs are not scene breaks, `.docx` footnotes land at the end of the manuscript. _Built 2026-10-16 (owner): split at a chosen paragraph, move where a section starts, the reason beside every boundary and the rule beside every chapter (`Proposal.openings`, `SECTION_REASON_COPY`); a longer run of blank lines than usual is a scene break; footnotes go at the end of their section. Import package tests, an import router test, flow 7._
- [ ] **The contributors strip on the reader** (FR-9.2), **request cards in the margin** with a way to the right chapter (FR-11.5), **a record of version promotion** (FR-10.2), **the full lineage** (FR-10.5), **"closing soon"** in browse (FR-11.3), the example label on every seeded surface (FR-15.3), open rewrite requests in the seeded library (FR-15.4), admin shortcuts and feature flags anything reads (FR-13.7, FR-15.5).
- [ ] **NFRs**: the reader fetches its prose in the browser, so first paint is the chrome (NFR-1, never measured on slow 3G); logs are kept nowhere (NFR-7); the scheduled jobs and backups stop silently after 60 days without a commit (NFR-8); the vocabulary linter does not read server copy, emails, exports or import.

### D. Where the plan needs the owner

- [x] The weekly digest runs on Mondays; FR-12.3 says Sunday, and the nudge email says Sunday. _Done 2026-10-16 (owner: Sunday): `cron.yml` runs it at 09:00 on Sundays; `docs/05-deployment.md` says so._
- [x] A story made public, private, then public again shows what was written while private (decision 0007 against FR-2.7). _Done 2026-10-16 (owner: keep it private): decision 0039, `PrivateSpan` (migration `20261016140000_private_spans`), one rule in `lib/authz` for revisions, suggestions and the profile, and the reader names each stretch. Also found and closed: `compare.suggestionAgainstHead` never applied decision 0007 to suggestions. Unit and integrity tests._
- [x] Imports do not count toward five new stories a day (FR-13.3). _Done 2026-10-16, following FR-13.3 as written: a committed import spends one of the five, and starting one says so first if the day is spent. Import test._
- [x] "Reader × export" is in the code's matrix and not in the SRS; versions are `?version=`, not `?v=`. Both want recording. _Done 2026-10-16: the row and `?version=` are recorded in `01-srs.md` §3.2 and §4._
- [x] "A suggestion arrived" is emailed immediately; FR-12.3 keeps immediate for decisions on your own work. _Done 2026-10-16, following FR-12.3 as written: hourly._

---

## Audit before deployment

A read of the whole codebase against the SRS, requirement by requirement,
prompted by the decision to stop adding phases and get the thing deployed.
Two requirements were genuinely unbuilt. Both had the same shape: the half
that shows up in a demo was there, and the half somebody only notices weeks
later was not.

1. **FR-2.7, the second half.** Making a storyboard private closed nothing and
   told nobody. It was the one TODO left in the codebase, carrying a phase 2
   label. A contributor part-way through a suggestion lost the request, the
   passage and the context at once, because a private storyboard answers 404
   to anyone who is not an author — and had no way to find out why. Marking a
   storyboard finished (FR-14.1) had the same silence, so both now go through
   one helper that closes and notifies. A thirteenth notification type,
   `REQUEST_CLOSED`, and five tests.

2. **FR-9.6.** The contributors page listed credits and had no way to get them
   out as text, which is what the requirement is for: an acknowledgements page
   in a book. It also lacked two of the four things the requirement names —
   the chapter and the permanent address. Resolving a credit to an address is
   the interesting part: a credit records a _lineage_, not a section, so the
   address has to be resolved against wherever that lineage sits in the main
   draft now. One that no longer appears there gets a line with no address
   rather than a wrong one.

_Corrected 2026-10-16: the next sentence was not true. The spec review above
found co-authorship, screenplay editing and several screens never built, and
others built on the server only._

Everything else in the SRS is implemented. Forty-four requirement numbers are
never written down in the code, which is not the same as being unbuilt — most
are, and the check that found these two was reading each one rather than
counting mentions.

---

## Every phase, every pull request

- `pnpm check-vocabulary`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Schema change → migration + seed update.
- New procedure → authz decision at the data layer + a matrix test if a new cell is touched.
- Socially significant event (accept, pass, restore, spin-off, report, suspend) → structured log line with an `event` field.
- User-facing copy in sentence case; buttons name their consequence.
- This file updated: tick the task, note the date, record any deviation.

## Open decisions

| OD    | Question                                                 | Blocks                 | Status      | Decision                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1  | The name (domain taken; crowded in film)                 | Phase 7                | closed      | Decision 0035 — Draftboard, and what a writer makes is a story. Done in phase 12; code and package names keep Storyboard. Decision 0021 had deferred it and listed what it touches. A domain is still to choose.                                                                                                                                     |
| OD-2  | Helping under a pen name separate from the account       | Phase 3                | closed      | Decision 0011 — one public name, no pen names in v1. A credit that cannot be traced to a person is not a credit.                                                                                                                                                                                                                                     |
| OD-3  | Contributor's right to delete their credit record (GDPR) | Phase 4                | part closed | Decision 0013 closes the half that blocked phase 4: a contributor may erase their record, the revision stays and is re-attributed. The other half — deleting a whole account — is phase 9 task 1 and still needs a decision.                                                                                                                         |
| OD-4  | Hide history written while private after going public?   | Phase 1                | closed      | Decision 0007 — history written while private stays private. Implemented: `publicFrom` on the storyboard, `historyVisibleFrom` in the reader.                                                                                                                                                                                                        |
| OD-5  | One "helped" idea per request, or unlimited              | Phase 2                | closed      | Decision 0010 — one credited idea per request, enforced by the `one_helpful_idea_per_request` partial unique index.                                                                                                                                                                                                                                  |
| OD-6  | Co-author quota exemption across storyboards             | Phase 6                | closed      | Decision 0016 — a bigger quota (10), not an exemption. Owner uncapped, everyone else 3.                                                                                                                                                                                                                                                              |
| OD-7  | Under-16 policy and adult-to-minor messaging             | Phase 7 (not optional) | open again  | Decision 0020 closed it with two halves; decision 0026 withdrew the age gate, so it is open with a narrower question: is having no private surface at all sufficient on its own? Phase 10, from what the report queue fills up with. The no-private-messages half still holds.                                                                       |
| OD-8  | What is searchable in an unpublished manuscript          | Phase 13               | open        | Full-text search is in the deferred table for a privacy reason, not a technical one. Somebody has to say what a stranger may search inside work nobody has published.                                                                                                                                                                                |
| OD-9  | Whether the marketing site should be a Next.js app       | Phase 9                | open        | One static page currently ships ~560 KB of framework JavaScript it never uses. Plain HTML, or a static-site generator, would be a fraction of that — against the cost of a second toolchain.                                                                                                                                                         |
| OD-10 | A Content-Security-Policy, and what it costs             | Phase 9                | open        | The application renders prose that strangers wrote and has no CSP. A strict one needs a nonce threaded from the proxy through the layout, which is a real change with a real chance of breaking a screen quietly — so it wants its own deliberate pass rather than being bolted onto a deployment phase. HSTS and the other headers are already set. |

## Hosting and services checklist

Account work, not code. Each row says which phase first needs it.

| Service                                                                                                                                     | Purpose                                         | Needed from                    | Status                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GitHub repository, branch protection on `main`, Dependabot, `good first issue` label                                                        | NFR-9                                           | Phase 0                        | `[~]` the repository, CI and Dependabot are live; branch protection and the label not checked (2026-10-24)            |
| Vercel project for `apps/app` — `draftboard`, live at draftboard-cyan.vercel.app since 2026-10-13                                           | hosting                                         | Phase 0                        | `[x]`                                                                                                                 |
| Vercel project for `apps/web` — `storyboard`, live at storyboard-rust-theta.vercel.app                                                      | hosting                                         | Phase 0                        | `[x]`                                                                                                                 |
| Prisma Postgres (decisions 0028, 0032). Singapore since 2026-10-13; nightly encrypted backup and Sunday drill green since 2026-10-15 (0033) | database, backups                               | Phase 0                        | `[x]`                                                                                                                 |
| Email: Gmail over SMTP now (decision 0029), Resend with a domain later                                                                      | FR-1.3 emails, FR-12                            | Phase 0 (dev works without it) | `[~]` Gmail live; mail lands in spam until a domain and Resend                                                        |
| Inngest                                                                                                                                     | digests, nudges, post-transaction notifications | Phase 3                        | `[-]` not used: the scheduled jobs run from GitHub Actions (decision 0030), kept alive by `keepalive.yml` (item 10.3) |
| Cloudflare R2: the uploads bucket, token and CORS rule (2026-10-14), and the locked backup bucket (2026-10-15)                              | imports, exports, backups                       | Phase 5                        | `[x]`                                                                                                                 |
| Upstash Redis                                                                                                                               | rate limits                                     | Phase 6                        | `[ ]` optional; whether production sets it is the owner's to confirm                                                  |
| Domain(s) for the final name, DNS, `app.` subdomain                                                                                         | OD-1                                            | Phase 7                        | `[ ]`                                                                                                                 |

## Deviations from `02-architecture.md`

Recorded as short decision records in `docs/decisions/`:

- 0002 — Authentication model: nullable `username`/`passwordHash` until onboarding completes, own `EmailVerificationToken` table, JWT sessions without the Auth.js database adapter, Argon2id.
- 0003 — Database-enforced invariants: the revision trigger's transaction-scoped hard-delete flag and its SQLSTATE; partial unique indexes for one main version and one open request.
- 0004 — Schema additions: `SectionDraft`, `NotificationPreference`, `Credit.inheritedFromId`, `Storyboard.deletedAt`/`finishedAt`/`forkedFromVersionId`, `User.isAdmin`/`onboardedAt`; `Version` has no `@@unique([storyboardId, isMain])` (it would also forbid a second non-main version).
- 0005 — Toolchain versions: Next 16, TipTap 3, Zod 4, tRPC's TanStack Query integration, TypeScript 5.9, Vitest 4, ESLint 9, pnpm catalog.
- 0006 — One `.env` at the repository root.

## Change log

- 2026-09-12 — Created. Phase 0 built and verified locally against Postgres 16 (migrations, seed, 35 tests, both production builds, the full sign-up and sign-in flow). CI green run pending the first push.
- 2026-10-18 — Phase 14 planned in `06-completion-plan.md`, from the review of 2026-10-17. Current position rewritten. No code changed.
