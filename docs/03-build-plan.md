# Storyboard — build plan

Eight phases. Each has a goal, the requirements it satisfies, and exit criteria that must pass before the next phase starts. Do not start a phase early because it looks easy; the ordering exists because of dependencies, not difficulty.

Estimates assume one developer, and are calendar weeks at a side-project pace.

---

## Phase 0 — Foundations

**~1 week · FR-1.6, NFR-3, NFR-8, NFR-9**

Monorepo, Postgres, Prisma schema in full (all models from `02-architecture.md` §3, even the ones nothing uses yet — migrations are cheaper now than later), the revision immutability trigger, Auth.js with email verification, the design tokens from §9 wired into Tailwind, shadcn installed and overridden, CI running lint + typecheck + tests, Neon branch previews, daily backups, and `scripts/check-vocabulary.ts` failing the build on a banned word.

**Exit:** a signed-in user exists in the database, `pnpm test` and `pnpm build` pass in CI, a revision `UPDATE` raises, and the vocabulary linter catches the word "merge" in a test fixture.

---

## Phase 1 — Write something

**~2 weeks · FR-2, FR-4, FR-8.1–8.4, FR-11.1 (partial)**

Storyboard creation, chapters and sections with reorder / split / merge, the TipTap editor with the restricted schema, autosave and durable revisions, the history panel, restore. Reader view — contents rail and manuscript at reading measure, no margin yet. Dashboard region one only.

Resolve **OD-4** before starting: whether history written while private becomes visible on going public.

**Exit:** you can write a three-chapter story, reorder it, see every revision, and restore one. Reader view renders 120k words without a frame drop. Nothing about contribution exists yet and that is correct.

---

## Phase 2 — The loop

**~3 weeks · FR-5, FR-6, FR-7, FR-8.5, FR-9.1–9.2**

The heart of the product. Contribution requests in all three kinds, the suggestion composer with constraints pinned and a live counter, ideas with one-level threading, the comparison engine, accept and pass, staleness and rebase, credits, the contributors strip.

**Build `packages/compare` first and in isolation**, against the fixture corpus, before any UI touches it. If the comparison is wrong or ugly, nothing else in this phase matters.

Resolve **OD-5** (idea credit cap) before the idea UI.

**Exit:** Playwright flows 3, 4 and 5 from `02-architecture.md` §8 pass end to end. Two accounts, one storyboard, a suggestion accepted, a second gone stale, rebased and accepted, both credits present, the comparison readable on a full rewrite.

---

## Phase 3 — Make it findable and make it hold

**~2 weeks · FR-9.3–9.6, FR-11, FR-12**

Browse with filters, genre pinning driving the dashboard, the reader's right margin with request cards and leader rules, profiles with the contribution calendar, the credits page, the notification centre, Resend emails with per-type toggles, Inngest digests and the seven-day silence nudge.

Resolve **OD-2** (pen names) before profiles ship publicly — changing identity display after people have credits is unpleasant.

**Exit:** a user who signs up, pins genres, and never creates anything still has a useful dashboard. Every notification type fires in a test and renders in both surfaces.

---

## Phase 4 — Versions and spin-offs

**~2 weeks · FR-10, FR-7.5**

Alternate versions with tree copy, promote to main, cross-version comparison matched on `lineage_id`, spin-offs with lineage banners and credit inheritance, the spin-off list on the original.

Resolve **OD-3** (contributor's right to delete a credit) — it changes what `Credit` deletion means and it is a legal question, not a product preference.

**Exit:** spin off a storyboard, write three chapters on it, and the original shows the spin-off with correct inherited credits while the spin-off shows the correct "has continued since" banner. Promoting an alternate to main loses nothing.

---

## Phase 5 — Bring work in, take work out

**~2 weeks · FR-3, FR-14**

The import pipeline and the boundary review screen, all six formats, exports to `.docx` / `.md` / `.pdf` / `.fountain` with the embedded contributors page, finished-state reading pages, proof-of-authorship export.

**Exit:** import a real 80,000-word `.docx` that has no heading styles, correct the proposed boundaries in under two minutes, and export it back out with contributors intact.

---

## Phase 6 — Trust

**~1.5 weeks · FR-13, FR-15.5, NFR-6**

Quota enforcement and global rate limits, community rules, reporting and the admin queue, suspension, the honest visibility copy, content hashing on every revision write.

Resolve **OD-6** (co-author quota exemption) — it is exploitable and it is a five-line fix now.

Then run the authorisation matrix tests again, deliberately, with fresh attention. This is the phase where a mistake exposes an unpublished manuscript.

**Exit:** a fourth submitted suggestion is refused with a clear message. Ten upheld reports suspend an account. A private storyboard returns 404, not 403, to a signed-in stranger at every route including the API.

---

## Phase 7 — Launch

**~2 weeks · FR-1.1, FR-15.1–15.4, NFR-1, NFR-4, OD-1, OD-7**

Seed 25 public-domain storyboards with hand-written stuck points and 15 worked examples, the marketing site with a real stuck passage as the hero, the community rules page, accessibility audit, performance pass, and the two blocking decisions: the name (**OD-1**) and the under-16 policy (**OD-7**).

Post to Reddit only once seeds are live and the six Playwright flows pass against production. The earlier Reddit post was for validating the idea; this one is for traffic, and traffic arriving at an empty site converts to nothing.

**Exit:** a stranger can land on the marketing site, read a real stuck passage without an account, sign up, and send a suggestion in under five minutes without asking you a question.

---

## Later — explicitly not in v1

Real-time collaborative editing in its own surface. Full-text search once the privacy policy exists. Plagiarism-database registration if a partner emerges. Licence handling. Subscriptions for exports or real-time rooms, if you ever want them.

---

## How to use this plan

One phase per session, one requirement per commit. At the start of each phase, re-read the phase section alongside `01-srs.md` and `02-architecture.md`. At the end of each phase, run the exit criteria yourself rather than assuming they pass — the difference matters.

The two places to slow down and review the code line by line are `packages/compare` (phase 2) and `lib/authz` (phase 6). Everything else is recoverable.
