# Draftboard — completion plan (phase 14)

The checklist that takes Draftboard from "the loop works" to "a stranger can rely
on it". It comes from the review of 2026-10-17: the code read area by area
against `01-srs.md`, `02-architecture.md` and `prototype.html`, plus the things a
production product needs that the SRS never listed — the kind of gap that
"forgot password" was before it was built.

`04-phase-plan.md` says where the project stands; this file is the work list for
phase 14 and the record of how each item was done. Work it top to bottom, tick
each item with evidence as it lands, then do the final pass (section 11), which
re-checks every item and re-scores the whole product.

**Baseline (2026-10-17).** Of the 100 numbered features in `01-srs.md` (FR-1.1 to
FR-15.6), about 80 are fully built, about 19 partly, and 1 not started (FR-8.6).
Of the 9 non-functional requirements, 5 are met and 4 partly (NFR-1, 4, 5, 7).
Judged ready for strangers: 70–75%.

**Started out of order, on purpose.** The owner started this phase on 2026-10-18
while phase 10 (one measurement, removing the Washington database) and phase 12
(the screen-reader pass, OD-7, OD-9) keep their owner-only items open. That is
the exception to "do not start a phase until the previous one's exit criteria
pass", written here so nobody has to wonder.

---

## How to use this file

- Legend, as in `04-phase-plan.md`: `[x]` done · `[~]` in progress or partly done (say what is missing) · `[ ]` not started · `[!]` blocked (say by what) · `[-]` dropped (say who decided and why).
- Each item carries a priority — **P1** before strangers use it, **P2** expected of a finished product, **P3** polish — and a size: **S** (hours), **M** (about a day), **L** (several days). Tags: `migration` (schema change), `decision` (write a record in `docs/decisions/`), `owner` (the owner must act or approve).
- Each item has four parts. **Now** is what the code does today; **Do** is the change; **Test** is the proof, which must fail on the current code when the item is a bug; **Done when** is what a person can see.
- Tick an item like this, and write only what you observed:
  `- [x] **1.3 — …** _(2026-10-21: router test "keeps a Google display name" fails on the old code and passes; flow 1 unchanged.)_`
- If an item turns out to be wrong — the code already does it, or the finding was mistaken — tick it `[x] no change needed`, with the evidence. Never build something to satisfy a checkbox.

## The working loop, for every item

1. Read the item, the requirement it names in `01-srs.md`, and any decision record it names.
2. Confirm the **Now** line in the code. Line numbers drift; search by the symbol or the copy. Every **Now** line comes from a read of the code on 2026-10-17 or 2026-10-18; most were confirmed twice, some only once. Confirm each one before changing anything.
3. For a bug, write the test first and watch it fail on the current code. For a feature, write the test alongside the code.
4. Build it, following the rules below.
5. Ask what the person sees when the server fails at this point. The answer must be a sentence, never a stack trace or a raw validation message.
6. Run the item's tests, then `pnpm typecheck`, `pnpm lint` and `pnpm check-vocabulary`.
7. Tick the item with the date and the evidence.
8. Go on to the next item. Within a milestone you may reorder items when one depends on another; the dependencies are named.

At the end of each milestone, run CI's exact steps and every browser flow (see "Local verification"). Then update `04-phase-plan.md` → "Current position", including the list of migrations production still needs.

## Rules that bite in this work

- **Vocabulary** (`01-srs.md` §2). The interface never says branch, merge, commit, fork, pull request, diff or repository, and never "storyboard": what a writer makes is a story (decision 0035). The linter checks pages and components. It does not check server copy, emails or exports until item 10.4 lands, so check those by eye.
- **Numbers** live in `apps/app/src/lib/schemas/constants.ts`. A new bound means a new constant. Copy that states a number derives it from the constant.
- **Schema changes** come with a migration in `packages/db/prisma/migrations` (never `prisma db push`), and a seed update if the seeds touch the change. Custom SQL carries a comment naming the requirement. Keep this phase additive: no dropped columns and no renames. Postgres refuses to use a new enum value in the transaction that adds it, so each `ALTER TYPE … ADD VALUE` goes in its own migration file, as `20261016130000_request_reopened_notification` does.
- **Permissions** are checked in `lib/authz`, at the data layer, with a matrix test for every new cell (NFR-6). To anyone who may not read it, a private or hidden story answers 404, never 403.
- **Decisions.** A deviation from `02-architecture.md`, or an owner decision below, gets a short record in `docs/decisions/`. The next free number at the time of writing is 0041.
- **No AI model calls** anywhere in the product (`01-srs.md` §1.3).
- **Socially significant events** — accept, pass, restore, spin-off, report, suspend, hide, promote, deletion — get a structured log line with an `event` field. From item 10.2 they are also stored.
- **Copy** is in sentence case, and a button names its consequence.
- **Tests** sit next to the code (`*.test.ts`). Database suites skip without `DATABASE_URL`. Browser flows are in `apps/app/e2e`. A requirement is done when a person can do it in the browser and a browser flow does it (2026-10-16 spec review).
- **A new notification type** touches the enum (its own migration), `lib/schemas/notifications.ts`, the email templates, `server/notification-targets.ts`, the settings toggles and every test that counts the types. To find each of those places, follow `REQUEST_REOPENED` through the code with grep.

## Safety rules

- **The root `.env` names the production database** on the owner's machine. Every command that touches a database gets both `DATABASE_URL` and `DIRECT_DATABASE_URL` on its own command line, both pointing at a local throwaway database. `packages/db/prisma.config.ts` prefers `DIRECT_DATABASE_URL` for migrations, so overriding only `DATABASE_URL` would migrate production.
- **Never touch production yourself.** Do not run `db:deploy`, `db:seed`, `db:migrate`, `db:reset` or the browser flows against it, and do not read its rows. Those are the owner's actions, listed at the end of this file.
- **Do not commit or push.** The owner reviews the work and pushes it.
- **Leave the tree deployable after every item.** The owner may push the working tree exactly as it stands. Leaving a new migration in the tree is safe: the build runs `db:check-migrations`, and Vercel refuses to deploy code whose migrations production lacks, so production keeps serving the previous build until the owner applies them. Write every pending migration into `04-phase-plan.md`'s Current position as soon as it exists.
- **No temporary files inside the repository.** Scratch scripts and databases live outside it.
- **No prose or Markdown inside a double-quoted shell string**, because backticks there run as commands. Edit files with an editor, never with `node -e "…"`.
- **Ports.** Port 3000 belongs to another project on the owner's machine. The app runs on 3200 in development and the browser flows on 3100. Stop only processes you started.

## Local verification

- **Database.** Use a throwaway PostgreSQL 16. The owner's machine has no Docker; the npm package `embedded-postgres`, installed in a scratch directory outside the repository and started with its own `pg_ctl`, works.
- **Fresh database per session.** Create the database, then run `pnpm db:deploy` and `pnpm db:seed` with both URLs set. The flows need a seeded database; without one, onboarding has no genres.
- **Browser flows** need `MAIL_LOG_FILE` pointing at a scratch file, as well as both database URLs.
- **CI's exact steps**, in order, before writing "green" anywhere:
  1. `pnpm format:check`
  2. `pnpm check-vocabulary`
  3. `pnpm lint`
  4. `pnpm typecheck`
  5. `db:deploy` and `db:seed` on a fresh local database
  6. `pnpm test`
  7. root `pnpm build`
  8. `pnpm e2e`, every project

## Decisions for the owner

Put these to the owner together, before item 1.1, and record each answer in the last column. If a question is still unanswered when its item comes up, use the default and mark the answer "default, not confirmed". An item with a `decision` tag gets its record in `docs/decisions/` when it is built.

| #    | Question                                                                       | Default, used unless the owner says otherwise                                                                                                                                                                                                                                                 | Items         | Owner's answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | What does a helper grant when they send a suggestion or an idea?               | They keep the copyright. If it is accepted or marked as helped, the story's authors get a permanent, worldwide, non-exclusive, royalty-free licence to use, edit and publish it as part of the story. Draftboard gets a licence to host and show it. Credit is asked, not enforced (FR-14.4). | 2.2           | Confirmed in substance by the owner (2026-10-18): credit only once a suggestion is accepted into the main draft; a helper may instead spin the story off, and the author sees who did; who changed what is always visible, to anyone on a public story and to its authors on a private one. The licence wording stays the default, for the terms page.                                                                                                                                                                                                                                                                                             |
| D-2  | May a spin-off be published outside Draftboard?                                | Only with permission from the authors of the text it carries over. On Draftboard it needs none (FR-10.3).                                                                                                                                                                                     | 2.2           | A, confirmed (owner, 2026-10-18): outside Draftboard only with the authors’ permission. The owner also asked for a Publish feature: a published, read-only edition of a story that changes only when republished, and a published spin-off tells and credits its original. Decision 0044 and milestone 7b; the terms say it when it is built.                                                                                                                                                                                                                                                                                                      |
| D-3  | Who runs Draftboard, for the privacy policy, the terms and `SECURITY.md`?      | Ask the owner. Until they answer, the pages say "Draftboard is run by its developer" and give the contact address.                                                                                                                                                                            | 2.1, 2.2, 2.5 | Open for the legal pages: the default wording stands until the owner gives a name or an entity. The owner’s answer was about roles instead: one admin for ever, sub-admins with permissions the admin grants, and everyone else a user, with an admin panel. Decision 0043 and milestone 2b.                                                                                                                                                                                                                                                                                                                                                       |
| D-4  | Can a deleted account's username be taken again?                               | No. Keep a hash of it and refuse it forever.                                                                                                                                                                                                                                                  | 1.6           | A, confirmed (owner, 2026-10-18): retired for ever, for a returning owner too; nothing of the old account transfers; the refusal reads exactly as for any taken name and says nothing about a deletion. Decision 0042, amended.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-5  | Profile pictures?                                                              | No uploads. Draw initials, as the prototype does.                                                                                                                                                                                                                                             | 3.13          | Owner (2026-10-18): uploads, yes. The picture is cut to a square and shrunk to a small icon on the server, so a profile picture costs a few kilobytes of storage and nothing else. Item 3.13 is rewritten for it.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-6  | What does the contribution calendar count?                                     | Help given on other people's stories (suggestions sent, ideas posted), rebuilt from the records.                                                                                                                                                                                              | 6.13          | A, confirmed (owner, 2026-10-18): a day is marked when a suggestion or idea is sent, whether or not it is later accepted; sending is the work, acceptance is the author’s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-7  | Does a reply to an idea need 20 words?                                         | No: 1 to 400. Top-level ideas keep 20 to 400.                                                                                                                                                                                                                                                 | 6.8           | A, confirmed (owner, 2026-10-18).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-8  | "Closing soon" in browse?                                                      | Keep "Waiting longest" and record why: no request ever closes by itself.                                                                                                                                                                                                                      | 6.15          | Owner (2026-10-18): neither. A request closes by itself 30 days after it is opened, and its page and card say so plainly ("Closes on 17 November") from the day it opens; browse keeps "Waiting longest". Item 6.15 is rewritten: a nightly close that does what the author’s own close does, with the author told.                                                                                                                                                                                                                                                                                                                                |
| D-9  | Can a person block another?                                                    | Yes, a small version. Someone you block cannot send anything to your stories, and you get no notifications from them.                                                                                                                                                                         | 2.9           | A, confirmed (owner, 2026-10-18), with two additions. The block is about sending: the blocked person still reads every story, the blocker’s included, and the person blocking is told exactly that before they confirm. On the blocked person’s side, the help buttons on that author’s stories give way to a sentence saying this author is not taking suggestions from them, so nothing fails silently. (The owner’s words were "let the author know"; read here as both sides being told, since the other reading leaves the blocked person guessing.) Item 2.9.                                                                                |
| D-10 | Error tracking: a third-party service, or our own tables?                      | Our own Postgres tables, an admin page and an hourly email to admins. No new account to open.                                                                                                                                                                                                 | 10.1          | A, confirmed (owner, 2026-10-18): our own tables; email is enough for now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-11 | Is the proof of authorship signed?                                             | It is checked against a public record page instead, so there is no signing key to manage.                                                                                                                                                                                                     | 8.12          | A, confirmed (owner, 2026-10-18). The owner raised a different limit: the record shows who wrote the words on Draftboard and when, and cannot show that they were original to that person; a copied first draft is not something it can detect, and nothing is built for that now. The record page says so in a sentence (8.12).                                                                                                                                                                                                                                                                                                                   |
| D-12 | Can a helper change a suggestion after sending it?                             | Yes, until an author opens it.                                                                                                                                                                                                                                                                | 6.7           | A, confirmed (owner, 2026-10-18), with one addition: a suggestion changed after it was sent carries an "Edited" mark, with the time, wherever it is shown. Item 6.7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-13 | Does an author get credit for their own suggestion or idea on their own story? | No.                                                                                                                                                                                                                                                                                           | 1.7           | A, confirmed (owner, 2026-10-18): owning the story is the credit. The owner suggested showing what share of a story is the author’s own words: item 6.17, P3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-14 | Who writes the new seeded stuck points?                                        | The developer drafts them, and the owner reads them before production is seeded.                                                                                                                                                                                                              | 9.5           | A, confirmed (owner, 2026-10-18), with an addition: the seeded stories carry open requests and a few suggestions and ideas, so a newcomer sees how helping works before anyone else is there; they are removed once there are real members. Item 9.5.                                                                                                                                                                                                                                                                                                                                                                                              |
| D-15 | How long can a session last without signing in again?                          | 90 days, however active it is.                                                                                                                                                                                                                                                                | 3.3           | Owner (2026-10-18): 30 days, not 90. Item 3.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-16 | Can a story change its type?                                                   | Yes, within the prose types or within the script types (screenplay, stage play), but not across.                                                                                                                                                                                              | 8.4           | A, confirmed (owner, 2026-10-18).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-17 | Refuse common passwords?                                                       | Yes: the 10,000 most common, and the email's local part or the username.                                                                                                                                                                                                                      | 3.9           | Owner (2026-10-18): no list of common passwords. Instead a password has at least 10 characters with a lower-case letter, a capital, a digit and a symbol; the rule is shown on the sign-up, reset and change-password pages; and changing a password to the one already in use is refused with a sentence. The local-part and username check goes with the list. Item 3.9 is rewritten. Developer’s note: composition rules are weaker than a block list against the passwords attackers try first (NIST SP 800-63B), so the sign-in rate limit (FR-13.3) is what stands in their way; the list can be added later without touching anything else. |
| D-18 | Which feature flags should exist?                                              | Three kill switches: pause sign-ups, pause imports, pause spin-offs.                                                                                                                                                                                                                          | 9.4           | A, confirmed (owner, 2026-10-18).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-19 | What does the privacy policy say about children? (OD-7 is open)                | "Draftboard isn't meant for children under 13. An account we learn belongs to one is deleted."                                                                                                                                                                                                | 2.1           | Owner (2026-10-18): open to everyone; no age is asked and none is stored (decisions 0020 and 0026 stand), and the policy says exactly that. Developer’s note: a policy with no under-13 line carries COPPA risk for US visitors, and the legal review before launch should look at it.                                                                                                                                                                                                                                                                                                                                                             |

## Milestones

| #   | Milestone                                 | Items | Why it is in this place                                                                              |
| --- | ----------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| 0   | Before you start                          | 3     | A baseline to compare the final pass against                                                         |
| 1   | Bugs that damage work, credit or accounts | 19    | Each one loses something a person made, or misleads them                                             |
| 2   | Trust, legal and moderation               | 9     | Done 2026-10-18, 9 of 9 (2.8 landed in 2b.5); three migrations and two pages to read await the owner |
| 2b  | Roles and the admin panel                 | 7     | Done 2026-10-18, 7 of 7; five migrations and `pnpm admin:grant` await production                     |
| 3   | Account basics                            | 16    | The "forgot password" class of gap                                                                   |
| 4   | Phones, loading and getting around        | 10    | Half of first visits arrive on a phone                                                               |
| 5   | Confirm before anything is lost           | 8     | One-click actions that email other people or remove work                                             |
| 6   | The help loop, complete                   | 16    | The product's core loop, without its rough edges                                                     |
| 7   | The reader the prototype drew             | 11    | The screen most visitors see first                                                                   |
| 7b  | Publishing                                | 5     | Asked for by the owner on 2026-10-18; reuses the reader                                              |
| 8   | The writing tool                          | 14    | What a writer expects of an editor                                                                   |
| 9   | Discovery, admin and seeds                | 8     | Finding stories, running the place, the first impression                                             |
| 10  | Operations and housekeeping               | 7     | Knowing when it breaks, and documents that tell the truth                                            |
| 11  | The final pass                            | —     | Every item re-checked, and the product re-scored                                                     |

---

## 0. Before you start

- [x] **0.1 — A local baseline.** Bring up a local database and run CI's exact steps on the untouched tree. Write down the number of tests and of browser flows. The last recorded figures were 522 tests and 34 flows on 2026-10-15, and there have been more since. _(2026-10-18: all eight steps green on the untouched tree, against a fresh local PostgreSQL 16.14. Formatting, vocabulary, lint (8 tasks) and typecheck (8 tasks) passed; 15 migrations applied and the seed wrote 24 genres, 26 stories and 56 requests; `pnpm test` ran **601 tests in 50 files** (app 438, import 47, compare 33, db 28, export 23, ui 3, root scripts 29); the root `pnpm build` passed; `pnpm e2e` ran **37 browser flows** in the one project, chromium, all passing in 2.6 minutes.)_
- [x] **0.2 — The decisions.** Put the decisions table to the owner and record their answers, or record that they confirmed the defaults. _(2026-10-18: the table was put to the owner, each row with options and a recommendation, and every answer is recorded in the table: D-1, D-2 and D-4 to D-19 answered or confirmed, several with additions that rewrote their items (2.9, 3.3, 3.9, 3.13, 6.7, 6.15, 8.12, 9.5) or added milestones (2b, 7b, 6.17). D-3's wording for the legal pages is still open and uses its default.)_
- [x] **0.3 — Current position.** In `04-phase-plan.md`, record that phase 14 has started. _(2026-10-18: the overview row and the Current position's State line record the start, the baseline figures and the migrations production still needs.)_

---

## 1. Bugs that damage work, credit or accounts

All P1.

_Milestone closed 2026-10-18, 19 of 19. Closing run on a fresh local database: CI's eight steps green (21 migrations applied from scratch; the seed wrote 24 genres, 26 stories and 56 requests), 637 tests in 57 files (app 474 in 45, import 47, compare 33, db 28, export 23, ui 3, root scripts 29), and all 39 browser flows: 38 in the run, and the reader's performance flow, which looked for chapter buttons that item 1.14 made links, corrected and passed on its own. Against the baseline: 36 tests, 7 files and 2 flows more. Production needs six migrations, listed in `04-phase-plan.md`'s Current position, and may set `SUPPORT_EMAIL`._

- [x] **1.1 — Deleting an alternate version removes it** · FR-10.1 · M · `migration` _(2026-10-18: `Version.deletedAt`, migration `20261018003000_version_tombstone`. Two integrity tests, "removes a deleted alternate from the list, from compare and from promotion" and "makes no version without a chapter the main draft", fail on the old code (the deleted version stayed listed; a chapterless version was promoted) and pass with the fix. The backfill was checked on a local database holding planted pre-fix rows: the alternate whose chapters were all tombstoned took the latest tombstone's time, and the main draft and the live, mixed and chapterless alternates stayed untouched. `loadVersion` answers NOT_FOUND for a removed version, so compare, rename, create-from, export, spin-off and every `?version=` page refuse it; promotion refuses, with a sentence, a removed or chapterless version, and does so again inside its transaction in case one is removed between the check and the write. Flow 6 deletes the demoted draft and finds Versions listing one and Compare saying the story has one version; 2 of 2 flow-6 tests pass. Lint, typecheck and vocabulary clean. The owner's read-only query is in the owner's list.)_
  - **Now:** `version.delete` (`server/trpc/routers/version.ts`) marks the version's chapters and sections removed and closes their requests, but `Version` has no `deletedAt`.
    - `version.list` does not filter, so the deleted version stays listed as "0 chapters · 0 words" and is still offered in Compare.
    - `promoteToMain` accepts it. The main draft becomes a version with no chapters, `carryRequestsOver` closes every open request, and every helper is emailed.
    - The confirmation in `versions-panel.tsx` promises "this draft will no longer be listed".
  - **Do:**
    - Add `Version.deletedAt` in a migration.
    - Backfill it for every non-main version that has chapters and no live one, as the latest of their `deletedAt`. A version's last chapter cannot be removed (`chapter.delete`), so only `version.delete` produces that state.
    - `delete` sets the column inside its transaction.
    - Wherever a version is resolved by id, treat a deleted one as not found: `loadVersion`, `version.list`, `storyboard.get({ versionId })`, `compare.versions`, the export route's `?version=`, history.
    - `promoteToMain` refuses a deleted version, and any version with no live chapter.
  - **Owner:** a story already hit by this bug has a main draft with no chapters, and the repair is to promote its previous main back. In the final report, give the owner a read-only SQL query for production that finds main versions with no live chapter. Do not run it yourself.
  - **Test:** an integrity test that deletes an alternate, then checks that `list` leaves it out, `promoteToMain` answers BAD_REQUEST, and reading or comparing it answers NOT_FOUND.
  - **Done when:** in flow 6, a deleted alternate disappears from Versions and from Compare.

- [x] **1.2 — Contents follows the version being read** · FR-10.1 · S _(2026-10-18: flow 6 now opens the alternate, follows the reader's Contents link, adds a chapter there and checks the main draft still has one. On the old code it failed at the first check, the link landing on `/contents` with no `?version=`; with the fix it passes. The page reads `?version=`, names an alternate ("Contents of “The other ending”", with a line saying the main draft is untouched), and its story link and every Write link keep the parameter. Typecheck and lint clean.)_
  - **Now:** the reader's Contents link drops `?version=` (`app/s/[slug]/reader-shell.tsx`), and `contents/page.tsx` calls `storyboard.get({ slug })` with no version. So restructuring "an alternate" edits the main draft that readers see. Edit and History keep the parameter.
  - **Do:**
    - The Contents link carries `?version=` when an alternate is being read.
    - The page reads `searchParams.version` and passes `versionId`, which `storyboard.get` already accepts, so `ContentsEditor` receives the alternate's id.
    - The page names the version: "Contents of 'Ship never lands'".
    - Every link out of the page keeps the parameter.
  - **Test:** flow 6 opens an alternate, adds a chapter on its Contents page, and checks that the main draft is unchanged.

- [x] **1.3 — A Google user keeps their name** · decision 0027 · S _(2026-10-18: new `routers/user.test.ts`. "keeps a display name that is already there" fails on the old code, where "Ada Lovelace" came back as the username, and passes with the fix; "uses the username as the display name when there is none" passes before and after. The display name is set to the username only when it is empty or blank. Typecheck and lint clean; flow 1 runs unchanged in the milestone's full run.)_
  - **Now:** `user.chooseUsername` sets `displayName: input.username` with no condition (`routers/user.ts`). That overwrites the name `auth/google.ts` stored from Google, so "Ada Lovelace" is credited as "ada-l".
  - **Do:** set the display name to the username only when the display name is empty.
  - **Test:** a router test checks that a user with a display name keeps it after choosing a username, and that one without a display name gets the username.

- [x] **1.4 — Formatting clicks don't save a version** · FR-4.4, FR-8.3 · S _(2026-10-18: flow 2 now types, selects the first word, presses Italic from the toolbar, waits for the draft autosave, and finds History still holding one version; "Save now" then makes the second. On the old code the step failed, and in doing so found a second fault: the click blurred the editor and saved a version, and no draft autosave ever followed, because both save callbacks depended on the `useMutation` objects, which are new on every render, so the effects owning the draft timer and the five-minute revision timer re-ran on each re-render and their clean-up cleared whatever was pending. Fixed: toolbar buttons prevent default on mousedown; the editor's blur ignores focus moving into the toolbar, whose own blur saves once focus has left both, which covers a script's Element `<select>`; and both callbacks depend on the stable `mutateAsync` functions. The suggestion composer has no formatting buttons, and its Element control saves only a draft, so it took the stable-callback fix alone. Flows 2 and 6 pass, 5 of 5; typecheck and lint clean.)_
  - **Now:** `ToolbarButton` (`components/section-editor.tsx`) has no `onMouseDown` guard. A click blurs the editor, the blur handler commits a revision, and History fills with near-identical versions. The discard button already guards against this.
  - **Do:**
    - Prevent the default on mousedown for every toolbar button.
    - For the screenplay Element control, if it is a `<select>`, commit on blur only when focus leaves both the editor and its toolbar: check `relatedTarget` against the toolbar's container.
    - Make the same change to the suggestion composer's toolbar.
  - **Test:** flow 2 italicises a word from the toolbar and checks that the history count does not grow until the person leaves the editor.

- [x] **1.5 — Account deletion is never silent** · decision 0024 · M _(2026-10-18: new `routers/settings.test.ts` (four tests) and a purge test; on the old code a wrong confirmation was accepted, no email went out, `deletionStatus` did not exist and the purge sent nothing; all pass with the change. `requestDeletion` takes `{ confirm }` and checks it against the username, or the email for an account without one; the address is told at once, with the date and a link to settings; `deletionStatus` feeds a banner that the app layout and the reader show on every signed-in page, with "Keep my account"; the purge reads the address first and sends the last message after the erasure, so what it says is true, logging a failed send without stopping. "Picture" is gone from the deletion screen's list. Flow 10 now finds the email in the mail log, sees the banner on the dashboard and on a story, and keeps the account from the banner; 2 of 2 pass. Typecheck, lint, vocabulary and the structural procedure test clean.)_
  - **Now:**
    - `settings.requestDeletion` takes no input and sends no email.
    - There is no banner, although decision 0024 promises one.
    - The typed-username check exists only in the browser (`settings/delete-account.tsx`).
    - So someone in a stolen session can schedule the erasure, and the owner never hears about it.
  - **Do:**
    - The mutation takes `{ confirm }` and checks on the server that it equals the username, or the email address when there is no username.
    - Send a transactional email at once: "Your account will be deleted on {date}. If this wasn't you, sign in, choose Keep my account, and change your password." Include a link to `/settings`.
    - While `deletionRequestedAt` is set, show a banner on every signed-in page with a "Keep my account" button that calls `cancelDeletion`. Put it in the `(app)` layout and the reader header for now; item 4.1 moves it into the shared header.
    - The purge sends a last "your account has been deleted" email to the real address before tombstoning it. A failed send is logged and does not stop the purge.
    - Remove "picture" from the deletion screen's list (see 3.13).
  - **Test:**
    - Router tests: a wrong `confirm` is refused, the email appears in the mail log, and cancelling clears the request.
    - A purge test checks that the final email is sent before the address is tombstoned.
    - A flow step sees the banner and uses Keep my account.

- [x] **1.6 — A deleted account's username stays retired** · FR-1.3, decisions 0011 and 0024 · M · `migration` · `decision` (D-4) _(2026-10-18, on D-4's default, not yet confirmed: decision 0042; `RetiredUsername { hash, retiredAt }` in `20261018024000_retired_usernames`. A purge test checks the SHA-256 of the lower-cased name is written in the erasure's own transaction, and a router test checks `usernameAvailable` answers unavailable and `chooseUsername` refuses; both failed before the table existed and pass now. Names erased before this change left no record, and the record says so. Typecheck, lint and vocabulary clean. Owner confirmed D-4 the same day, asking that the refusal say nothing about a deletion: it now reads exactly as for a taken name, "That username is taken. Try another.", and the record is amended.)_
  - **Now:** the purge sets `username: null` (`server/purge/accounts.ts`), and `chooseUsername` only checks current users. A stranger can take `/@name`, including addresses already printed in someone's acknowledgements.
  - **Do:**
    - Add `RetiredUsername { hash String @id, retiredAt DateTime }`. The purge writes the SHA-256 of the lower-cased username in the same transaction.
    - `chooseUsername` and `usernameAvailable` refuse a retired name exactly as a taken one (owner's choice, 2026-10-18): "That username is taken. Try another."
    - Accounts erased before this change left no record; say so in the decision record.
  - **Test:** a purge test checks that the hash is written, and a router test checks that the name is refused.

- [x] **1.7 — Credit only for help from someone else** · FR-6.9, FR-9.1 · S · `decision` (D-13) _(2026-10-18, on D-13's default, not yet confirmed: decision 0041. `routers/idea.test.ts` checks that a reply and an author's own idea are refused as the one that helped, with no credit, while a helper's top-level idea is taken and credited; the integrity test checks that an owner accepting their own suggestion gets the revision in their name and no credit. Both failed on the old code and pass now. The request page offers "This one helped" only on ideas from outside the story, from the authors' ids the request query now returns. Typecheck, lint and vocabulary clean.)_
  - **Now:** `idea.markHelpful` accepts a reply, and an idea written by one of the story's own authors, and credits them for it. `suggestion.accept` credits an owner or co-author who suggested on their own story.
  - **Do:**
    - `markHelpful` refuses replies (`parentId` set) and ideas written by an owner or accepted co-author: "Only an idea from outside the story can be the one that helped."
    - The idea thread offers the button only where it would succeed.
    - `accept`: when the contributor is an owner or co-author at that moment, create no PROSE credit. The revision still records them as its author.
  - **Test:** router tests for both refusals, and an accept test that checks no credit is created.

- [x] **1.8 — Ideas only where ideas belong** · FR-5.2, FR-6.9 · S _(2026-10-18: new `routers/idea.test.ts`; on the old code a rewrite and a continue request took ideas and a resolved request took a new top-level idea, and both tests pass with the fix. `ideaTakenNow` in `lib/schemas/help.ts` is the one rule: new ideas while open or answered, replies also while resolved, nothing while closed; the server refuses with its sentence and the request page shows the form, or the Reply button, only when it would be accepted, and otherwise the same sentence. New browser flow `e2e/flow-14-ideas.spec.ts`, the first to post an idea at all: a reader answers a "help me think" request, the author closes it, and the reader finds no form and the reason. Passes. Typecheck, lint and vocabulary clean.)_
  - **Now:** `idea.post` selects the request's `kind` and never checks it, and refuses only CLOSED requests. The request page renders the idea form whenever `canPostIdea` is true, whatever the request's state, so the server refuses an idea only after the person has written it.
  - **Do:**
    - Ideas only on UNBLOCK requests.
    - New top-level ideas only while the request is OPEN or ANSWERED. Replies also while it is RESOLVED. Nothing on CLOSED.
    - The page shows the form only when it would be accepted, and otherwise says why.
  - **Test:** router tests, and a flow step on a closed request.

- [x] **1.9 — Replies reach the person replied to** · FR-6.9, FR-12.2 · M · `migration` _(2026-10-18: `IDEA_REPLY`, hourly, in migration `20261018020000_idea_reply_notification` (its own file, as every enum value). The test in `routers/idea.test.ts` fails on the old code, where the type did not exist, and passes with the change: the author's reply tells the idea's writer, another helper's reply tells the writer and the authors and not the replier, and a writer replying under their own idea tells nobody of their own words. The row leads to the request at `#idea-{id}`, which the thread's items now carry. Email, settings toggles and the digest come from the one table; its count test moves to fifteen. Typecheck, lint and vocabulary clean.)_
  - **Now:** `idea.post` notifies only the story's authors (`notifyAuthors`), so a helper never learns that the author answered them.
  - **Do:**
    - Add a new notification type, `IDEA_REPLY`, delivered hourly. Follow the "new notification type" rule above.
    - A reply notifies the writer of the top-level idea, unless they wrote the reply.
    - Story authors keep getting `IDEA_RECEIVED` for replies they didn't write.
    - The link goes to the request, at the thread.
  - **Test:** router tests. When the author replies, the helper gets `IDEA_REPLY`. When the helper replies, the authors are told and the helper is not.

- [x] **1.10 — Withdrawals are recorded, and an author who opened it is told** · FR-6.5 · M · `migration` _(2026-10-18: `Suggestion.openedAt` in `20261018021000_suggestion_opened_at` and `SUGGESTION_WITHDRAWN` (hourly) in `20261018022000_suggestion_withdrawn_notification`, its own file. The integrity test "records a withdrawal, and tells the authors only if one had opened it" fails on the old code, where nothing wrote `withdrawnAt` and nothing recorded an opening, and passes with the change: an unopened withdrawal tells nobody; one an author had opened (set once, when an owner or co-author loads `suggestion.get`) tells the authors; and Accept or Pass on it a moment later reads "{name} withdrew this a moment ago", in the first check and in the conditional write inside the transaction alike. The type count test moves to sixteen. Typecheck, lint and vocabulary clean.)_
  - **Now:** `suggestion.withdraw` changes the state and nothing else. `Suggestion.withdrawnAt` exists in the schema and nothing writes it. Nothing records whether an author has opened a suggestion, so FR-6.5's "notifies the author only if the author had already opened it" cannot be done.
  - **Do:**
    - Add `Suggestion.openedAt`. Set it once, with a conditional update where it is null, when an owner or co-author loads the suggestion's comparison page.
    - `withdraw` writes `withdrawnAt`.
    - If `openedAt` is set, `withdraw` notifies the story's authors with a new type, `SUGGESTION_WITHDRAWN`, delivered hourly, in a migration of its own.
    - An author who presses Accept or Pass on a suggestion that was just withdrawn reads "{name} withdrew this a moment ago."
  - **Needed by:** 6.7.
  - **Test:** router tests. An opened suggestion's withdrawal notifies the authors, an unopened one's does not, and `withdrawnAt` is set.

- [x] **1.11 — The note survives drafts and re-sends** · FR-6.2, FR-6.7 · S _(2026-10-18: the integrity test "keeps the note through a draft and a re-send" fails on the old code, where the note came back null, and passes with the change. `saveDraft` takes the note and stores it (an emptied one clears it); `submit` keeps the stored note when its input leaves the note out; the composer opens on the saved note, saves it with the draft three seconds after it is typed, through a ref so its save callback stays stable, and sends it on. Typecheck, lint and vocabulary clean.)_
  - **Now (found once):**
    - The composer keeps the note in React state only (`suggestion-composer.tsx`).
    - `submit` writes `note ?? null`, so updating a stale suggestion and sending it again erases its note.
    - "Leave it as a draft" loses the note too.
  - **Do:** `saveDraft` stores `note`, and the composer loads it. `submit` keeps the stored note when its input leaves the note out.
  - **Test:** router tests. A note saved in a draft is kept by a submit that omits it, and a stale suggestion that is rebased and sent again keeps its note.

- [x] **1.12 — "Help me think" requests move through their states** · FR-5.9, FR-6.9, FR-12.4 · M · `migration` (data) _(2026-10-18: the definition lives in `server/answers.ts` with a unit test (`answers.test.ts`), and the integrity test "moves a help-me-think request on ideas from outside, and nudges only without one" fails on the old code, where the author's own idea took the request out of the nudge, and passes with the change: the author's idea leaves it OPEN and nudged, a helper's idea makes it ANSWERED, "This one helped" makes it RESOLVED with `resolvedAt`, and reopening finds it ANSWERED again. The nudge case sits in that test rather than in the digest suite, because the helpers it needs are there. Browse's "No answers yet", the dashboard's and the reader's idea counts, and the nudge all use the definition; the lists count idea answers in code because the authors differ per row. An unblock request's close button reads "Close this request" and a resolved one "Resolved — an idea helped". Migration `20261018023000_unblock_request_states` sets existing requests' states from their ideas, with `resolvedAt` taken from the helping idea's credit. The reading of FR-5.9 is noted in `04-phase-plan.md`. Typecheck, lint and vocabulary clean.)_
  - **Now (found once):** ideas never move an unblock request to answered, and "This one helped" does not resolve it. The idea counts behind "No answers yet", browse and the seven-day nudge include replies and the authors' own ideas (`request.ts`, `browse.ts`, `server/mail/digests.ts`), so one reply from the author drops the request out of the nudge.
  - **Do:**
    - In `server/answers.ts`, define an idea answer: a top-level idea, not removed or hidden, by someone who is not an owner or accepted co-author.
    - The first such idea moves the request from OPEN to ANSWERED. `markHelpful` moves it to RESOLVED and sets `resolvedAt`. Reopening returns it to OPEN or ANSWERED by the same rule.
    - Browse, the request lists and the nudge all use this definition.
    - A resolved unblock request reads "Resolved — an idea helped". The close button's copy for unblock requests is "Close this request", not "…without accepting".
    - A data migration sets existing unblock requests' states from their ideas.
    - Note this reading of FR-5.9 in `04-phase-plan.md`.
  - **Test:** a unit test for the definition, an integrity test for the transitions, and a digest test for the nudge.

- [x] **1.13 — Permission refusals speak the interface's words** · `01-srs.md` §2 · S _(2026-10-18: two tests added to `lib/authz/matrix.test.ts`: every label is checked against the linter's own eight patterns, and a refusal is checked to reach the person as "You do not have permission to do that (Delete a story)." The first fails on the old labels at "Read public storyboard" and both pass after the rewrite of all sixteen labels in the interface's words; 111 matrix tests pass. Item 10.4 makes the linter read this folder. Typecheck, lint and vocabulary clean.)_
  - **Now:** `assertCan` (`lib/authz/index.ts`) builds "You do not have permission to do that (Delete storyboard)." from `ACTION_LABELS` in `lib/authz/matrix.ts`. The error formatter shows it to the person, so a banned word reaches the screen.
  - **Do:** rewrite every label in the interface's words ("Delete a story", "Read a private story", "Report a person or a story", and so on), and update any matrix test that asserts a label.
  - **Test:** a matrix test checks that no label contains a banned term. Item 10.4 makes the linter catch this whole class of copy.

- [x] **1.14 — The reader's chapter lives in the address** · FR-11.5, `01-srs.md` §4 · M _(2026-10-18: flow 2's guest test now opens chapter 2 from the Contents rail, finds `/c/2` in the address with the rail marking it current, reloads and is still there, and goes Back to chapter 1. It failed on the old code, where the rail was buttons, and passes with the change: the rail, "Previous chapter" and "Next chapter" are links to `/s/{slug}/c/{n}`, keeping `?version=`; the chapter being read is the address, not state, and the shell is keyed by chapter; on arrival at a chapter's address its heading takes focus. 3 of 3 flow-2 tests pass. Typecheck and lint clean.)_
  - **Now:** switching chapters is `useState` in `reader-shell.tsx`, and the address stays `/s/{slug}`. Refreshing returns to chapter 1, Back leaves the story, and nothing moves the scroll position or the focus.
  - **Do:**
    - Chapter links, "Next chapter" and "Previous chapter" become real links to `/s/{slug}/c/{n}`, keeping `?version=`. That page already renders the reader at that chapter.
    - On arrival, scroll to the top and focus the chapter heading (`tabIndex={-1}`).
  - **Test:** a flow opens chapter 2, reloads and is still on chapter 2, then goes Back to chapter 1.

- [x] **1.15 — A suspended person is told so after a correct password** · decision 0018 · S · needs 2.5's contact address _(2026-10-18: the credentials check moved out to `auth/authorize.ts`, where `auth/authorize.test.ts` runs it against the database: an active account signs in with the right password and not a wrong one; a suspended account is refused with the code `suspended` after the right password and with nothing after a wrong one; an unknown address gets nothing. The message test in `lib/sign-in-error.test.ts` checks the sentence names the contact address. All three failed before the change. The contact address comes from `lib/site.ts`, built ahead of item 2.5: `SUPPORT_EMAIL` when set, else the address inside `EMAIL_FROM`, with a unit test for the fallback; `SUPPORT_EMAIL` is optional in `env.ts`, in Turborepo's env list and in `.env.example`, and the owner adds it to `.env` and Vercel if the contact should not be the sender. Flow 8 now reads the sentence on the locked-out sign-in. Typecheck, lint and vocabulary clean.)_
  - **Now:** `auth/index.ts` returns null for a suspended account before checking the password, so the person reads "That email and password do not match". A password reset then appears to work, and the new password is "wrong" too.
  - **Do:**
    - For an account with a password, verify it first, with the same cost as the decoy hash.
    - If it matches and the account is suspended, throw a `CredentialsSignin` subclass whose code is `suspended`.
    - `signInErrorMessage` (`lib/sign-in-error.ts`) maps that code to: "This account is suspended while reports about it are reviewed. Write to {contact} if you think that's wrong."
    - A wrong password stays generic. Google sign-in stays AccessDenied (decision 0027).
  - **Test:** a unit test for the message, and auth tests for both the right-password and wrong-password paths.

- [x] **1.16 — A used confirmation link says the account is ready** · FR-1.4 · S _(2026-10-18: two router tests in `auth.test.ts` fail on the old code, where a used or expired link only threw "expired or already used", and pass with the change: `verifyEmail` answers `finished` for a used link whose account has a password and a confirmed address, `expired` with the address for one that ran out before the account was finished, and NOT_FOUND only for a link nobody issued. The page shows "Your account is ready" with sign-in, or "Send a new link" through `resendVerification` with the sign-up form's own uniform answer; the hours on the page and in the email come from `VERIFICATION_TOKEN_TTL_HOURS`. An older test that expected the used link to throw now expects `finished`; `setPassword` still refuses it. Flow 1 opens the link a second time and reads the ready screen; it failed before the change. Typecheck, lint and vocabulary clean.)_
  - **Now:** setting a password consumes every confirmation link for the account, so the "Your account is ready" branch in `(auth)/verify/page.tsx` can never be reached. A second click reads "This link has expired… Request a new one" and leads to `/signup`. The page and `templates/verify-email.ts` hard-code "24 hours".
  - **Do:**
    - `auth.verifyEmail` returns `{ email, hasPassword: true }` for a consumed token whose account has a password and a confirmed address. Tokens keep `consumedAt`, so this can be told apart.
    - A link that expired before the account was finished offers "Send a new link", which calls `resendVerification` for the token's address and gives the same answer whatever the address.
    - Derive the hours from `VERIFICATION_TOKEN_TTL_HOURS`.
  - **Test:** a router test for the consumed-token path, and flow 1 opens the link twice.

- [x] **1.17 — Lists show what they say** · FR-11.1, FR-11.3 · S _(2026-10-18: the integrity test "lists open requests from other people only, and filters stories by type" fails on the old code, where the owner's own request came back from `listOpen`, and passes with the change. `listOpen` leaves out stories the viewer owns or co-authors; `browse.storyboards` takes `types`, reusing the filters schema's own field, and the browse page passes it. Typecheck and lint clean.)_
  - **Now:**
    - The dashboard's "in your genres" region (`request.listOpen`) includes the viewer's own requests.
    - Browse's type filter is never passed to `browse.storyboards`: `(app)/browse/page.tsx` sends only the query and the genres.
  - **Do:**
    - Leave stories the viewer owns or co-authors out of `listOpen`.
    - Add `types` to `browse.storyboards`' input, and pass it.
  - **Test:** router tests.

- [x] **1.18 — Dates in the reader's own time zone** · S–M _(2026-10-18: `lib/time-zone.ts` (cookie and header names, validation by trying the zone, one formatter with the interface's six date styles; unit-tested, including a date that is 18 October in UTC and 19 October in Kolkata), `lib/dates.ts` (the server reads the `tz` cookie), `components/time-zone-cookie.tsx` (sets it on arrival and renders the page once more the first time), and the tRPC client's `x-time-zone` header for item 6.13. Every server component that wrote a date now writes it in that zone: the editor's "draft you left on", the request, suggestion, suggestions, contributors, lineage and profile pages, the deletion banner and the deletion email; the history panel takes the zone from its page so the hours no longer change on load. Activity days stay UTC until 6.13. New `e2e/time-zones.spec.ts`, in an Auckland context because the machine is in Kolkata, checks the cookie and then, with scripts off and the same cookies, that the server's own HTML shows the history time in Auckland; it failed before the change and passes after. Typecheck, lint and vocabulary clean.)_
  - **Now:** server components format dates in the server's zone, which is UTC on Vercel.
    - `edit/page.tsx` says "the draft you left on …" in UTC.
    - `history-panel.tsx` renders hours in UTC on the server and in local time in the browser, so they change on load.
    - Activity days are UTC days.
  - **Do:**
    - A small client effect in the root layout sets a `tz` cookie from `Intl.DateTimeFormat().resolvedOptions().timeZone`. The server checks it against `Intl.supportedValuesOf('timeZone')`.
    - One server helper, `formatDate(date, style)`, reads the cookie and falls back to UTC.
    - The tRPC client sends an `x-time-zone` header, which item 6.13 uses for activity days.
    - Replace the ad-hoc date formatting in server components; grep for `toLocale`.
  - **Test:** a unit test for the helper, and a flow in a Playwright context with `timezoneId: 'Asia/Kolkata'` that checks a date written near midnight.

- [x] **1.19 — Whole added or removed paragraphs are labelled in words** · FR-7.1, NFR-4 · S _(2026-10-18: flow 4 now gives the first suggestion one paragraph more than the original and, after switching the rewrite to side by side, finds "Added" at the start of it; it failed before the change. The comparison's rows carry a small "Added" or "Removed" word beside the tint. The four accessibility scans stay clean. The comparison here is a rewrite, which opens in read-through (FR-7.2.3), so the labels sit behind the toggle, as the marks do. Typecheck, lint and vocabulary clean.)_
  - **Now (found once):** in `components/comparison-view.tsx`, a paragraph that was wholly added or removed is shown only by a tint, and the "—" placeholder opposite it is `aria-hidden`. The file's comment promises screen-reader labels that don't exist.
  - **Do:** add a small visible label, "Added" or "Removed", at the start of each such paragraph, alongside the tint.
  - **Test:** flow 3-4-5 checks for the label on a suggestion that adds a paragraph, and the axe scan stays clean.

---

## 2. Trust, legal and moderation

**Closed 2026-10-18:** 9 of 9 (2.8 landed in 2b.5). Three migrations await production (`hidden_after_report`, `user_blocks`, `terms_accepted`), and two pages await the owner's reading, `/privacy` and `/terms`; D-3's identity wording is the one open question, and "run by its developer" stands until it is answered. Decisions 0045, 0046 and 0047 written. Flows 1 and 8, the accessibility pass and the CSP pass are green against fresh builds; 690 tests in 66 files pass across the workspaces. Found on the way and fixed: the hidden-suggestion check in `suggestion.accept` first sat before the authz check and would have told a stranger that a hidden suggestion existed.

- [x] **2.1 — A privacy policy** · P1 · M · `owner` (D-3, D-19) _(2026-10-18: `/privacy`, public, in the sitemap and in the `@deployed` accessibility and CSP lists, which pass against a fresh build (4 of 4, 5 of 5). Every claim checked against the code: the `User` columns, `lastSeenAt` and the administrator's note included; the cookies, which are the sign-in library's and `tz`; the processors of `env.ts` and `docs/05`; every number from `constants.ts` (`ACCOUNT_DELETION_GRACE_DAYS`, `SOFT_DELETE_GRACE_DAYS`, `IMPORT_JOB_RETENTION_HOURS`, the new `BACKUP_RETENTION_DAYS`, `TIME_ZONE_COOKIE_DAYS`), rate-limit rows kept a day. It says plainly what is not yet there: an account-wide export is a letter to us until 3.14, and unconfirmed sign-ups are kept until 3.12. Children per D-19; "run by its developer" per D-3's default. Linked under both sign-up buttons, from the footer and from the marketing footer; settings reaches it through the footer. Owner: read it. The legal review before launch stays in the final report.)_
  - **Now:** neither app has one. Google sign-in in production needs a privacy policy address on its consent screen.
  - **Do:** a public `/privacy` page in the app. Leave it out of `NEEDS_AN_ACCOUNT`, add it to the sitemap, and link it from the footer (2.6), sign-up, settings and the marketing footer. Write it in plain language. Check every claim against the code as you write it, and take every number from `constants.ts`.
    - **What is kept:**
      - the account: email, the Argon2id password hash, username, display name, bio, pinned genres, reading and email preferences, and the Google account id when Google is used
      - the writing: stories with every version, suggestions, ideas, reports and credits
      - IP addresses inside rate-limit records, for as long as the prune keeps them (check the prune)
      - server logs, which the host keeps briefly
      - stored events (10.2) and errors (10.1)
    - **Who processes it, and where:**
      - Vercel: the application, with its functions in Singapore
      - Prisma Postgres: the database, in Singapore
      - Cloudflare R2: imported files and the encrypted backups
      - Google: email delivery over Gmail, and sign-in with Google for people who choose it
      - GitHub Actions: the scheduled jobs and the nightly backup, encrypted before it leaves
    - **What is public:** public stories and everything in them, profiles and credits. Private stories, and the private stretches of decisions 0007 and 0039, are not.
    - **How long:**
      - a deleted account: `ACCOUNT_DELETION_GRACE_DAYS`, after which the writing stays, shown as "a former member" (decision 0024)
      - a deleted story: `SOFT_DELETE_GRACE_DAYS`
      - an unused import: `IMPORT_JOB_RETENTION_HOURS`
      - backups: 30 days (decision 0033)
      - unconfirmed sign-ups: see item 3.12
    - **The person's rights, and how to use them:** download (3.14), correct (settings), delete (settings), erase a contribution record (decision 0013), and contact (2.5).
    - **No tracking.** No advertising, no analytics, no tracking pixels (FR-12.5). The cookies are the session's, Auth.js's own, `tz` (1.18) and `reading` (7.5). All are necessary, so there is no consent banner.
    - **Children:** D-19. Who runs Draftboard: D-3.
    - A "Last updated" date.
  - **Test:** an `@deployed` e2e check that `/privacy` loads for a guest and is linked from sign-up.
  - **Done when:** the owner has read it. Recommend a legal review before launch, in the final report rather than on the page.

- [x] **2.2 — Terms of use, with what a helper grants** · P1 · M · `owner` · `decision` (D-1, D-2) _(2026-10-18: `/terms`, public, listed and checked as 2.1. Eight sections: who may use it (D-19), your writing stays yours and Draftboard's licence, what a helper grants (decision 0047, D-1), spin-offs and publishing (D-2; decision 0044's edition to follow), nothing here is private (0020), moderation (0018, 0045, 0046, the quota from `SUGGESTION_QUOTA`), leaving (0024, from `ACCOUNT_DELETION_GRACE_DAYS`), no warranty and changes. Decision 0047 written for D-1 and D-2. Owner: read it.)_
  - **Do:** a public `/terms` page covering:
    - who may use the product, and the community rules (link)
    - that people keep the copyright in what they write, and that Draftboard needs a licence to store, show and copy it to run the service, including backups and authors' exports
    - that public stories are readable by anyone, and can be spun off on Draftboard by anyone signed in (FR-10.3)
    - what a helper grants: D-1
    - spin-offs published elsewhere: D-2
    - that authors may publish their stories anywhere (FR-14.4)
    - moderation, suspension and appeal (decision 0018), and account deletion (decision 0024)
    - no warranty, how the terms change, and the contact address
  - Write the decision record for D-1 and D-2.
  - **Test:** as 2.1.

- [x] **2.3 — Agreeing at sign-up, and the rules shown once** · FR-13.4 · P1 · S–M · `migration` _(2026-10-18: `User.termsAcceptedAt`, migration `20261018037000_terms_accepted`, set where an account is created (`auth.signUp`, `auth/google.ts`) in place of `rulesSeenAt`. "By creating an account you agree to the terms and the privacy policy" under the email button, and "By continuing you agree…" under the Google button, which sign-in shares. The genres step shows the six rules in a line each (`RULES_SUMMARY`), the page in a new tab, and "I have read the community rules", which Finish waits for; `user.pinGenres` refuses without the tick for an account that has not read them, sets `rulesSeenAt` when it has, and never asks again, so settings re-pins without it and accounts from before keep their stamp. Tests: `user.test.ts` gains the refusal, the stamp and the once; `google.test.ts` asserts the new column; flow 1 meets the rules on the genres step with Finish disabled until the tick (2 of 2 pass against a fresh build; `signUpAndOnboard` ticks it too). The stale checkbox comment in the sign-up form is gone.)_
  - **Now:**
    - Sign-up shows a link to the rules (`signup/sign-up-form.tsx`), next to a stale comment about a checkbox that no longer exists.
    - A Google sign-up started from `/signin` sees no rules at all.
    - `rulesSeenAt` is stamped when the account is created (`routers/auth.ts`, `auth/google.ts`) and is never read.
  - **Do:**
    - Under every button that creates an account (email sign-up and both Google buttons): "By creating an account you agree to the Terms and the Privacy policy."
    - Add `User.termsAcceptedAt`, set when the account is created.
    - The genres step is the last step of onboarding on both paths. It shows a short summary of the rules, with a link to the full page, and requires "I've read the community rules" before Finish. That sets `rulesSeenAt`; stop stamping it at creation. Existing accounts keep their value.
  - **Test:** flow 1 sees the rules on the genres step, and a router test checks that finishing sets `rulesSeenAt`.

- [x] **2.4 — Every non-essential email can be stopped in one click** · FR-12.1, FR-12.5 · P1 · M _(2026-10-18: `Mail` gains `headers`, and Resend and SMTP pass them on. `server/mail/unsubscribe.ts`: the token is an HMAC-SHA256 under `AUTH_SECRET` over the person and the kinds of email (or all), base64url, no expiry, read back with a constant-time compare and a Zod shape; `stopEmail` turns those kinds off as the settings would and leaves an erased account alone. The notification, digest and quiet-nudge templates carry `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) and a footer that says why the email came, with "Stop emails like this" and "All email settings"; the transactional templates carry neither. `POST /api/unsubscribe?t=` is the one-click endpoint (200; back to the page when the page's button pressed it), `GET` on it redirects to the public `/unsubscribe` page, which changes nothing until its button is pressed. Every runner passes the link: immediate with its one type, hourly with the types it carries, weekly with `WEEKLY_DIGEST`, the nudge with its own. Tests: the token round-trips and refuses a changed payload, a changed signature, another secret, garbage and an unknown type (3); the route turns off the named kinds and only those, changes nothing on GET or for a changed token, and comes back to the page (3); the templates carry the headers and name each kind once, and the confirmation email carries none (3); the digest suites pass unchanged. Lint, typecheck and vocabulary clean.)_
  - **Now:**
    - The `Mail` type has no headers (`server/mail/mailer.ts`), and neither SMTP nor Resend sets `List-Unsubscribe`.
    - The footer links to `/settings`, which needs a sign-in, and never says why the email came.
    - All product mail leaves one Gmail account (decision 0029), so every "Report spam" hurts delivery for everyone.
  - **Do:**
    - `Mail` gains optional `headers`, and both providers pass them on.
    - Notification and digest emails carry `List-Unsubscribe: <https://…/api/unsubscribe?t=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). The transactional emails — confirmation, reset, account exists, password changed, deletion — carry neither.
    - The token is an HMAC-SHA256, keyed with `AUTH_SECRET`, over the user id and the notification types the email covers (or `all`), encoded base64url, with no expiry.
    - `POST /api/unsubscribe` is the one-click endpoint. It turns email off for those types and answers 200.
    - `GET /unsubscribe?t=` is a public page that says what will be turned off, and turns it off only when the button is pressed, because link scanners fetch every GET.
    - The footer says why the email came ("You're getting this because email for {types} is on in your settings"), with "Stop emails like this" and "All email settings".
  - **Test:**
    - Unit tests: the token round-trips, and a tampered token is refused.
    - Route tests: POST changes the preferences, GET changes nothing.
    - A mailer test: the headers are on a notification email and absent from a confirmation email.

- [x] **2.5 — A way to reach a person** · P1 · S · `owner` (D-3) _(2026-10-18: `lib/site.ts` (from milestone 1) gives `SUPPORT_EMAIL` or the address inside `EMAIL_FROM`, with 2 unit tests. A public `/contact` page, "Reach a person", names the four reasons to write (help, an appeal, work copied here, a security problem) and shows the deployment's address; it uses D-3's default wording, "run by its developer". Linked from the 404 page ("Write to a person"), from a suspended person's own profile notice, and from the suspended sign-in message of 1.15; the footer follows in 2.6 and the hidden-story banner in 2.7. In the sitemap, and in the `@deployed` accessibility and CSP page lists; both pass against a fresh build (4 of 4 and 5 of 5). `SECURITY.md` points at the contact page instead of a placeholder address, so it never goes stale. `SUPPORT_EMAIL` is in `.env.example`; the owner adds it to `.env` and Vercel if the address should differ from the sender's.)_
  - **Now:**
    - There is no contact, support or appeal route anywhere.
    - `SECURITY.md` says "TODO: set a real address".
    - A suspended person is told their account is under review, with no way to answer.
  - **Do:**
    - `lib/site.ts` exports the contact address: `SUPPORT_EMAIL` when it is set, otherwise the address inside `EMAIL_FROM`. It is never required, so the deployment preflight is unchanged.
    - A public `/contact` page says what to write about: help, an appeal, someone else's work copied by a person without an account, a security problem.
    - Link it from the footer, the 404 page, the suspension notices (1.15 and the profile) and the hidden-story banner (2.7).
    - `SECURITY.md` names the address.
    - Add `SUPPORT_EMAIL=` to `.env.example`. The owner keeps `.env` listing the same names, so the owner list includes adding it there.
  - **Test:** a unit test for the fallback, and an `@deployed` check that `/contact` renders.

- [x] **2.6 — A footer on every page** · P1 · S _(2026-10-18: `components/site-footer.tsx`, rendered by the root layout on every page but the editor, whose address ends in `/edit` and whose chrome is the page's own: Draftboard · Rules · Privacy · Terms · Contact · Source code (AGPL-3.0, the repository's address). The marketing footer gains Privacy, Terms and Contact, pointing at the app. The accessibility pass runs with the footer on every public page it visits.)_
  - **Do:**
    - App footer: Rules · Privacy · Terms · Contact · Source code (AGPL; the repository's address) · Draftboard.
    - Marketing footer: add Privacy, Terms and Contact, pointing at the app.
  - **Done when:** every page except the editor shows the footer.

- [x] **2.7 — Moderation can hide what it upholds** · FR-13.5, FR-13.7, NFR-6 · P1 · L · `migration` · `decision` _(2026-10-18: decision 0045. `hiddenAt`, `hiddenById` and `hiddenReason` on `Idea`, `Suggestion` and `Storyboard`, migration `20261018035000_hidden_after_report`. The queue gains "Uphold and hide" on open reports about a story, suggestion or idea, and "Hide it" and "Show it again" on decided ones, with a "hidden" mark on the row; `admin.decide` takes `hide` and `admin.setHidden` does the rest, both behind `reports.decide`. A hidden story: `lib/authz` answers not found to everyone but its authors and a moderator (`actor.moderator`, set by `actorFrom` from the account's role and grants); authors keep their permissions, a moderator reads and writes nothing; `visibleStoryboardsWhere` and the new `PUBLICLY_LISTED` carry it to browse, the sitemap, public profiles, the Sunday digest, the quiet nudge and the spin-off lists; the reader shows its authors a banner with the reason and the contact link. A hidden suggestion or idea reads "Removed after a report." to everyone but its writer and a moderator (`server/hidden.ts`, with `hidden` and `redacted` on every row), its note and comparison are withheld, it is no answer (`ANSWERS`, `ideaAnswerWhere`, `TOP_LEVEL_IDEAS`), it cannot be accepted or marked as helped, and it holds no quota place; the idea thread, the suggestion list, the suggestion page and the profile's credits say so. Tests: four matrix cases (guest and reader find nothing, authors keep it, a moderator reads and cannot write, the list filter) and `routers/hidden.test.ts` with real contexts: redaction for a stranger against the writer and a moderator, the comparison withheld, accept and mark-helpful refused, the counts, the story hidden and shown again, and "Uphold and hide" taking the report's category; 182 tests in the 7 affected files pass. Flow 8 hides the reported story from the Upheld tab, finds a guest gets 404, and shows it again: 3 of 3 flow-8 tests pass against a fresh build.)_
  - **Now:** upholding a report changes only the report (`admin.decide`). Nothing has a hidden state, so an upheld abusive idea, or a story of copied work, stays up.
  - **Do:**
    - Add `hiddenAt`, `hiddenById` and `hiddenReason` (`ReportCategory`) to `Idea`, `Suggestion` and `Storyboard`.
    - The admin decision gains "Uphold and hide" for an idea, suggestion or story, and "Show it again".
    - **A hidden idea or suggestion:** its text reads "Removed after a report" for everyone except its writer and admins. It is not an answer (`server/answers.ts`), cannot be accepted or marked as helped, and no longer counts toward the writer's quota.
    - **A hidden story:** in `lib/authz` it is not found for everyone except its owner and admins. Browse, the sitemap, profiles, dashboards, exports and spin-off creation all go through that same guard. The owner sees a banner with the reason and the contact address.
    - Nothing is ever deleted, because credit is permanent. The action is a stored event (10.2).
  - **Test:**
    - Matrix rows for a hidden story: guest, reader, owner, admin.
    - Router tests: redaction for ideas and suggestions, and refusal to accept a hidden suggestion.
    - Flow 8 hides an idea.

- [x] **2.8 — An admin can suspend someone by hand** · FR-15.5 · P1 · S · folded into 2b.5 on 2026-10-18 (owner's roles plan, decision 0043) _(2026-10-18: landed with 2b.5, refusals, note and flow step included.)_
  - **Now:** suspension happens only at `REPORTS_TO_SUSPEND` upheld reports. The screen can lift a suspension but not impose one, although `admin.setUserStatus` exists.
  - **Do:**
    - "Find an account" on `/admin`, by exact username or email, shows the status and the upheld and open report counts.
    - "Suspend" requires a note; "Lift" ends a suspension.
    - An admin cannot suspend themself, or another admin.
  - **Test:** router tests for both refusals, and a step in flow 8.

- [x] **2.9 — Blocking a person** · P2 · M · `migration` · `decision` (D-9) _(2026-10-18: decision 0046. `UserBlock`, migration `20261018036000_user_blocks`. The rule is `blockedByAuthors` in `lib/authz`, asked of the database by `blockedFromHelping` and `assertNotBlocked` in `guard.ts` only where help begins: `suggestion.startDraft`, `suggestion.submit` (a re-send included), `idea.post`, and the request page's permissions, which also carry `blockedFromHelping` so the buttons give way to the one sentence, in `lib/schemas/help.ts`, that the server refuses with. Reading is untouched. `notifyAuthors` and the spin-off notice tell nobody who has blocked the actor. `block.set` and `block.list`; "Block" on a profile behind a confirmation that says what a block does and does not do, "You have blocked …" with Unblock, and "Blocked people" in settings. Tests: two matrix cases for the rule (owner's and co-author's blocks count, an author or a guest is never kept out) and `routers/block.test.ts` with real contexts: the refusals and their sentence, the page's permissions, reading left alone, a stranger unaffected, the silenced withdrawal notice, a co-author's block and its lifting, self-block refused, the list and the profile's flags (4 tests). Flow 8 gains "someone you block can still read, and cannot help". Lint, typecheck and vocabulary clean.)_
  - **Do:**
    - Add `UserBlock { blockerId, blockedId, createdAt }`, keyed on the pair.
    - On any story where an owner or co-author has blocked them, a blocked person cannot start a suggestion draft, send one, or post an idea. The help buttons give way to one sentence, and the server refuses with the same one (D-9): "This author isn't taking suggestions from you. You can still read the story."
    - Before confirming a block, the person blocking is told what it does: "They can still read your stories. They can't send you suggestions or ideas, and you won't hear from them."
    - The story's authors get no notifications from that person's actions.
    - Their existing work stays, and can be passed.
    - "Block" on a profile (signed in, never yourself), and "Blocked people" in settings with Unblock.
    - The checks live in `lib/authz`.
  - **Test:** matrix and router tests, and a flow step.

---

## 2b. Roles and the admin panel

Decision 0043, at the owner's request on 2026-10-18. One admin, for ever and only one; sub-admins with the admin's permissions minus whatever the admin withholds; everyone else a user. Item 2.8 is folded into 2b.5.

**Closed 2026-10-18:** 7 of 7. Five migrations await production (`roles`, `sub_admin_grants`, `last_seen`, `account_standing`, `banned_names`), after which the owner runs `pnpm admin:grant <email> --production` once. Found on the way, and fixed: the ten-report suspension would have locked the administrator out of the panel; a sub-admin granted only `accounts.delete` could not reach the People screen (a greater power now carries the lesser); the purge left an administrator's note about the person, and a sub-admin's grants, behind; and the `RetiredUsername` model of 1.6 had been placed between `Version`'s comment and `Version` in the schema. Flow 8 covers the panel end to end; 666 tests in 61 files pass across the workspaces.

- [x] **2b.1 — Roles, and one admin** · FR-15.5, decision 0043 · P1 · M · `migration` _(2026-10-18: `enum Role` and `User.role`, migration `20261018030000_roles`; the backfill makes every flagged account a sub-admin and the earliest of them the admin, and the partial unique index `one_admin` refuses a second. `grantAdmin` in `packages/db/src/admin.ts` and `pnpm admin:grant <email> [--production]` (`scripts/grant-admin.ts`), which refuses a database off this machine without the flag and prints who was demoted. `lib/authz/admin.ts` holds the capability list and `canAdmin`; `admin.test.ts` covers every capability for the admin, a sub-admin with and without a grant, a user, a guest, and an admin suspended or being deleted (4 tests). `grant-admin.test.ts`, on the local database: granting twice leaves one admin and demotes the first, a second ADMIN written by hand is refused by the index with P2002, and an unknown address is refused (2 tests). The purge sets `role` back to USER and its test asserts it. The export routes and the trust flow no longer touch `isAdmin`; flow 8 makes its administrator through `grantAdmin`, and is run again with the flow step of 2b.5. Lint, typecheck and vocabulary clean.)_
  - **Now:** `User.isAdmin` is a flag set by hand in the database; nothing in the interface sets or shows it.
  - **Do:**
    - Add `enum Role { USER, SUB_ADMIN, ADMIN }` and `User.role`, defaulting to `USER`, backfilled from `isAdmin` in the migration; a partial unique index keeps exactly one `ADMIN`. `isAdmin` stays this phase and is read nowhere once this lands.
    - `pnpm admin:grant <email>` (`packages/db/scripts/grant-admin.ts`), against the direct URL: makes that account the admin and demotes the previous one. It refuses a hosted URL unless the owner passes `--production`, and prints what it changed.
    - `actorFrom` carries `role`; `lib/authz` gains `canAdmin(actor, capability)` over the fixed capability list in the record, and `isAdmin` checks become `canAdmin`.
  - **Test:** a matrix test per capability × role, and a script test on a local database: granting twice leaves one admin.

- [x] **2b.2 — Every admin procedure behind its capability** · NFR-6 · P1 · S–M _(2026-10-18: `adminProcedure(capability)` in `init.ts`; the eight `admin.*` procedures name `reports.decide`, `accounts.suspend`, `seeds.manage` or `flags.toggle`; the admin page and the procedures share `canAdmin`, and the page answers 404 without `overview.read`. `procedures.test.ts` parses the capability and fails on an admin procedure without a known one; `builders.test.ts` covers the admin in good standing, a sub-admin with no grant, a user, and an admin suspended, being deleted or erased. 201 tests in the 11 affected files pass; lint and typecheck clean. The sub-admin who holds a grant is covered by `builders.test.ts` and by 2b.3's router test.)_
  - **Do:** `adminProcedure(capability)` in `server/trpc/init.ts` on top of `activeProcedure`; every `admin.*` procedure, the seed manager and the flags move onto it, naming their capability; `procedures.test.ts` learns the builder and fails on an admin procedure that lacks a capability. `/admin` pages read `canAdmin` and answer 404 to anyone without `overview.read`, the same way a private story does.
  - **Test:** the structural test, and router tests for a sub-admin with and without the grant.

- [x] **2b.3 — Sub-admins** · decision 0043 · P2 · M · `migration` _(2026-10-18: `SubAdminGrant`, migration `20261018031000_sub_admin_grants`, cascading with either account. `roles.manage` joins the capability list as the admin's alone: no grant confers it, and `setGrants` refuses it in its input schema (decision 0043 amended). `admin.setRole` moves an account between user and sub-admin, never the admin, never yourself, never an erased account, and demotion deletes the grants in the same transaction; `admin.setGrants` replaces the set. The request context loads a sub-admin's grants with the account, and `server/admin-actor.ts` does the same for pages. New `routers/admin.test.ts` builds the sub-admin's context with `createTRPCContext` itself: a granted door opens and an ungranted one answers 404, a sub-admin can neither grant nor change a role, a suspension closes every door and a lift reopens them, a grant to a user or outside the list is refused, and demotion leaves no grant rows (4 tests). `builders.test.ts` gains the sub-admin with and without the grant. 95 tests in the 11 affected files pass; lint and typecheck clean across the workspaces. The People screen that shows and changes role and grants is 2b.5.)_
  - **Do:** `SubAdminGrant { userId, capability, grantedById, grantedAt }`, keyed on the pair; `admin.setRole` (admin only: user ↔ sub-admin, never admin) and `admin.setGrants` (admin only); demoting deletes the grants. On the People screen (2b.5), the admin sees and changes a person's role and grants; a sub-admin sees neither.
  - **Test:** router tests: a sub-admin cannot grant, cannot touch the admin, loses powers with a suspension.

- [x] **2b.4 — Overview** · FR-15.5 · P2 · M · `migration` _(2026-10-18: `User.lastSeenAt`, migration `20261018032000_last_seen`, written by the request context through `server/last-seen.ts`: at most once an hour per account, after the response has gone, by plain SQL so `updatedAt` keeps its meaning. `admin.overview`, behind `overview.read`, returns eleven counts from `server/admin-overview.ts`: members in all and new or seen within 7 and 30 days, stories, open requests, suggestions sent and accepted, ideas that helped, and open reports; erased accounts, seeded stories and the help written on them are left out. `/admin` opens on them (`overview-panel.tsx`). Tests in `routers/admin.test.ts`: the touch happens, is skipped ten minutes later, happens again two hours later and leaves `updatedAt` alone; and every number is checked against a fixture of three members, a real and a seeded story, four suggestions, three ideas and a report, read inside one repeatable-read transaction so the parallel suites cannot move the counts, then rolled back. Lint and typecheck clean; `prisma migrate diff` against the local database reports no difference between the migrations and the schema.)_
  - **Do:** `User.lastSeenAt`, touched by the session read at most once an hour. `/admin` opens on the numbers: members in all and new in 7 and 30 days; signed in within 7 and 30 days; stories, open requests, suggestions sent and accepted, ideas marked as helped; and the queue's open reports. Counts are counts, never pages of 100.
  - **Test:** a router test for each number against a known fixture.

- [x] **2b.5 — People: find, suspend, ban, delete** · FR-15.5, decision 0018, decision 0024 · P1 · M · `migration` · absorbs 2.8 _(2026-10-18: `User.bannedAt` and `User.standingNote`, migration `20261018033000_account_standing`. `admin.findAccount` finds by exact username, with or without the @, or by address, case-insensitive, and answers null when nobody has it; `describeAccount` in `server/account-standing.ts` gives standing, role, the grants for the admin's eyes alone, the note, counts, upheld and open reports, joined and last seen. `setUserStatus` takes a note and refuses to lift a ban; `ban`, and `unban`, which also stops a deletion the ban came with; `deleteAccount`, behind `accounts.delete`, schedules the person's own kind of deletion, frozen as a ban, and mails the address a notice naming the support address, while `cancelDeletion` leaves a banned account alone and the banner says who closed it. `refuseIfUntouchable` keeps everyone off the administrator and off themself, and a sub-admin off other sub-admins; `suspendsForReports` keeps the ten-report suspension off the administrator. The People screen at `/admin/people`: find, the card, suspend, lift, ban, lift the ban, delete with the username typed to confirm, and for the admin the role and grants of 2b.3; the suspended list tells a ban from a suspension. Tests: 7 unit tests on the rules, and router tests for the lookup, the notes, the lift refusal, the deletion with its mail and banner flag, and every refusal; 54 tests in 8 files pass, lint and typecheck clean. Flow 8 gains the People step and is run with 2b.7.)_
  - **Do:**
    - "Find an account" by exact username or email: status, role, grants, upheld and open report counts, joined and last seen.
    - Suspend with a note; lift (the existing procedure); **ban**: a suspension with `User.bannedAt` set, which the report review and the lift button do not undo, with a note; **delete**: the same scheduled deletion the person could start (frozen at once, erased after `ACCOUNT_DELETION_GRACE_DAYS`), with the deletion notice sent to the address.
    - Nobody can suspend, ban or delete the admin, or themself; a sub-admin cannot act on another sub-admin.
    - Found while building 2b.3: `decide`'s automatic suspension at ten upheld reports (FR-13.5) would suspend the admin too, and `canAdmin` would then lock them out of the place. It skips the admin and logs that it did; a router test proves it.
    - Each action writes a log line with an `event` field, and a stored event once 10.2 lands.
  - **Test:** router tests for every refusal, and a step in flow 8.

- [x] **2b.6 — Names: ban a username** · decision 0043 · P2 · S · `migration` _(2026-10-18: `RetiredUsername` gains `reason` (RETIRED or BANNED), `name` and `note`, migration `20261018034000_banned_names`; a banned name is kept in clear so the Names screen can list it, and a retired one stays a hash. `admin.bannedNames`, `admin.banName` and `admin.unbanName` behind `names.ban`: a name an account holds is refused ("ban the account instead"), a retired name is "already unavailable" and is neither listed, turned into a ban nor lifted as one. `chooseUsername` and `usernameAvailable` refuse a banned name with the taken-name sentence as they did a retired one, without a change. The Names screen at `/admin/names`. Tests: a router test through the ban, a newcomer's refusal, the held and retired refusals and the lift; the username suite gains the banned case. Typecheck and lint clean.)_
  - **Do:** `RetiredUsername` gains `reason` (`RETIRED` default, or `BANNED`) and a nullable `note`; `admin.banName` and `admin.unbanName` behind `names.ban`; a Names screen lists banned names with their notes. `chooseUsername` and `usernameAvailable` refuse a banned name with the taken-name sentence, as they do a retired one.
  - **Test:** router tests, and the username test gains a banned case.

- [x] **2b.7 — The admin panel holds together** · FR-15.5 · P2 · S _(2026-10-18: one `admin/layout.tsx` with the screens this person may open down the side (`lib/admin-screens.ts`, `admin-nav.tsx` with `aria-current`), each screen its own route behind its capability: Overview at `/admin`, Reports, People, Names, Seeds, Flags. Anyone who may open none gets a 404 from the layout, as each page gives on its own. "Admin" in the header for anyone who may open a screen, leading to the first they may; the actor is read once per request (`current-actor.ts`). Flow 8 moves to `/admin/reports` and `/admin/people`, asserts the side list, the current mark and the header link, and runs the People step: 3 of 3 flow-8 tests pass against a fresh build. Lint, typecheck and vocabulary clean. The owner can do every basic thing they named without the database: see the numbers, find an account, suspend, ban or delete it, ban a name, make a sub-admin and choose their grants. Becoming the admin stays a command, by design.)_
  - **Do:** one `/admin` layout with a side list of its screens, each shown only to someone with its capability; "Admin" in the header for anyone with `overview.read` (4.1); the keyboard rules of 9.3 apply across the panel.
  - **Done when:** the owner, as admin, can do every basic thing they named without the database.

---

## 3. Account basics

_Milestone closed 2026-10-18, 16 of 16. Closing run on the local database: typecheck, lint and vocabulary clean; 731 tests in 73 files (app 566 in 60, db 30 in 6, import 47, compare 33, export 23, ui 3, root scripts 29); and all 47 browser flows — 46 in the full run, and flow 8's ten-reports test, which signed a second person in from a browser that was still signed in and met item 3.11's redirect, fixed in the shared `signIn` helper (it signs out from the header first) and passed on its own. Against the baseline: 130 tests, 23 files and 10 flows more. Production needs the nineteen migrations listed in `04-phase-plan.md`'s Current position, `pnpm admin:grant` once, and `sharp`, which `pnpm install` brings. Found on the way and fixed: a Google account's display name went in unchecked (3.8); the account-exists email told a Google-only person to sign in with a password it never had (3.4); the e2e mail-log helper cut a link off before `&next=` (3.5)._

- [x] **3.1 — Change your password while signed in** · P1 · S–M _(2026-10-18: `settings.changePassword` takes its two limits before the lookup (`AUTH_LIMITS.passwordChangesPerAccountPerHour`, `…PerClientPerHour`; decision 0037), checks the current password, D-17's rule for the new one, the match, and that the new one is not the old one, then sets `passwordHash` and `passwordChangedAt` (every other session ends, decision 0036) and sends the password-changed email; the settings form signs this browser in again with the new password so it stays. A Google-only account reads "You sign in with Google. To add a password, we'll email you a link" with the reset link. `settings.get` says `hasPassword` and never the hash. Decision 0027's line about which flow sets a password is corrected. Tests: wrong current, the same password, a weak one, a mismatch, the change with its mail and the session rule, the Google-only answer, and the eleventh try refused with the right password (3 settings tests); flow 11 changes a password from settings, finds this device still signed in, the old password dead elsewhere and the new one live (passes against a fresh build).)_
  - **Do:**
    - Settings gains "Password": current, new and confirm, using `PasswordInput`, with a hidden username field for password managers.
    - `settings.changePassword`:
      - verifies the current password
      - takes its limits before the lookup, in decision 0037's two cooldown families
      - checks the new password (3.9)
      - sets `passwordHash` and `passwordChangedAt`, which ends every other session (decision 0036)
      - sends the existing `password-changed` email
    - The browser then signs in again with the new password, so this device stays signed in.
    - An account with no password (Google only) reads: "You sign in with Google. To add a password, we'll email you a link." That uses the reset flow.
    - Correct decision 0027's line claiming that the confirmation flow sets a password: it is the reset flow that does.
  - **Test:**
    - Router tests: a wrong current password is refused, the limits apply, and older sessions end.
    - Flow 11, extended to change a password from settings.

- [x] **3.2 — Change your email address** · P1 · M · `migration` _(2026-10-18: `EmailChangeToken`, migration `20261018039000_email_change_tokens`, an hour long (`EMAIL_CHANGE_TTL_MINUTES`), hashed at rest, single use. `settings.requestEmailChange` takes its limits before the lookup (the per-client email limit and `AUTH_LIMITS.emailChangesPerAccountPerHour`), wants the current password, or for a Google-only account a sign-in within `RECENT_SIGN_IN_MINUTES` (the session now carries `authAt`), refuses the address it already has, answers "sent" whatever the address and sends nothing when another account has it. `auth.checkEmailChange` and `auth.confirmEmailChange` are public: the page at `/settings/email?token=` works signed out (the one settings path the gate lets through, with the test adjusted), and its button, not the GET, claims the link in one transaction, refuses an address taken since, sets the email and `emailVerifiedAt`, and ends every session through `sessionsEndedAt` (3.3, in place of the plan's `passwordChangedAt`); the old address is told with the new one shown in part (`maskEmail`) and the support address. Settings gains the form. Tests: the full change with its two mails, the session rule and the single use; the same answer and no mail for a taken address; the conflict at confirmation; the Google-only account refused without a recent sign-in and served with one (4); `maskEmail` (2); the gate's new exception (3 rows). Flow 11 changes an address through the mail log and signs in with the new one.)_
  - **Do:**
    - Add `EmailChangeToken { id, userId, newEmail, tokenHash (unique), expiresAt, consumedAt, createdAt }`, with its lifetime as a constant.
    - `settings.requestEmailChange({ newEmail, currentPassword })`:
      - needs the current password when the account has one
      - for a Google-only account, needs a sign-in within the last few minutes (a constant, against `authAt`), and otherwise reads "Sign in again to change your address"
      - normalises the address the way sign-up does
      - always answers "We've sent a link to {address}", and sends nothing when the address belongs to another account, so the answer reveals nothing
      - takes its limits as 3.1 does
    - The confirmation page, `/settings/email?token=`, works signed out. In one transaction it:
      - claims the token
      - checks the address is still free, and otherwise reads "That address is now used by another account"
      - sets the email and `emailVerifiedAt`
      - sets `passwordChangedAt`, ending other sessions
      - tells the old address, with the new one partly masked and the contact address
  - **Test:**
    - Router tests: the same answer for every address, single use, a conflict at confirmation, the old address told, sessions ended.
    - A flow step through the mail log.

- [x] **3.3 — Sign out everywhere, and sessions that end** · P1 · S · `migration` · (D-15) _(2026-10-18: `User.sessionsEndedAt`, migration `20261018038000_sessions_ended`. `SESSION = { slidingDays: 30, absoluteDays: 30 }` replaces the literal `maxAge`; `sessionRefused` in `auth/config.ts` refuses a token that signed in before the later of a reset and a sign-out everywhere, and any token older than `absoluteDays` however active (D-15); the session callback reads both columns in the lookup it already made. `settings.signOutEverywhere` sets the column; the button in settings then signs this browser out to `/signin?ended=1`, whose sentence already existed. Tests: the rule's three cases in `config.test.ts`, the procedure in `settings.test.ts`, and flow 11's new test where a second browser's session ends with the first's (passes against a fresh build).)_
  - **Now:** Sign out clears only this browser's cookie. Sessions slide for 30 days indefinitely (`maxAge` is hard-coded in `auth/config.ts`), and only a password reset ends other sessions.
  - **Do:**
    - Add `User.sessionsEndedAt`.
    - The token rule (`signedInBeforeReset` in `auth/config.ts`, used in `auth/index.ts`) refuses:
      - a token whose `authAt` is before the later of `passwordChangedAt` and `sessionsEndedAt`
      - any token more than `SESSION.absoluteDays` past its `authAt` (D-15: 30 days, however active it is)
    - Settings gains "Sign out on every device", which includes this one and lands on `/signin?ended=1`.
    - `SESSION` constants replace the literal `maxAge`.
  - **Test:** unit tests for the rule, and a router test.

- [x] **3.4 — Signing in keeps your address, and explains the dead ends** · P1 · S _(2026-10-18: the sign-in form is a client component on `useActionState` (`signin/sign-in-form.tsx`, its action in `signin/actions.ts`): a refusal comes back as the form's state with the message `signInErrorMessage` always gave, now with the contact address in it, and the email field is controlled, so the reset that follows a form action leaves it filled. Under the form, always: "Never got the confirmation email? Send it again" (the existing `resendVerification`, its uniform answer, the address from the field) and "Signed up with Google? Use Continue with Google below." The account-exists email has a `googleOnly` variant pointing to Continue with Google and to the reset link for choosing a password; `noticeExistingAccount` picks it by the absence of a password hash. The rate-limit code, `signInErrorMessage` and `next` are untouched; a Google refusal still arrives by the address bar. Tests: both variants of the email in `auth.test.ts`; flow 1's new test signs in with a wrong password and finds the address still there and both dead ends named (passes against a fresh build).)_
  - **Now:**
    - A failed sign-in redirects with error codes only (the server action in `signin/page.tsx`), so the email field comes back empty.
    - An unconfirmed account and a Google-only account are both told "email and password do not match", with no way forward on the page.
    - The "account exists" email tells a Google-only person to sign in with a password they never set.
  - **Do:**
    - The form uses `useActionState`. On failure the action returns `{ error, code, email }` instead of redirecting, and the email input takes `defaultValue={state.email}`.
    - Always shown under the form: "Never got the confirmation email? Send it again", using the existing resend with its uniform answer, and "Signed up with Google? Use Continue with Google."
    - The "account exists" email for an account with no password points to Continue with Google, and to Forgot your password for setting one.
    - Keep `signInErrorMessage`, the rate-limit code and `next` exactly as they are.
  - **Test:** flow 1 checks that a wrong password leaves the email filled in.

- [x] **3.5 — The page you came from survives sign-up** · FR-1.2, FR-1.5 · P1 · M _(2026-10-18: `next` rides the whole way, validated at each end by `safeNext`: "Create an account" on `/signin` and "Sign in" on `/signup` keep it (`withNext`); `auth.signUp` and `auth.resendVerification` take it and put it on the confirmation link; the verify page hands it to `SetPasswordForm` and to its resend link; every sign-in — password, first password and Google — lands on `afterSignIn(next)`, which is `/onboarding/username?next=`, and the proxy sends an onboarded person straight on from there, a new one into the step, forwarding `next` from step to step and adding it when a protected page sends someone to onboarding; the username and genres forms carry it and the last step lands on it, or on the dashboard as before. `safeNext` now refuses the doors themselves (sign-in, sign-up, verify, the reset pages, onboarding) so nobody is sent round again. Tests: `safe-next.test.ts` (the doors, `withNext`, `afterSignIn`); the link in `auth.test.ts` with a safe, an unsafe and a resent `next`; flow 1's new test takes a guest from "Sign in to help" through "Create an account", the mail log, the password, the name and the genres to that request's page and its "Write a suggestion" button (passes against a fresh build). The e2e mail-log helper now reads the whole link, `&next=` included.)_
  - **Now:**
    - "Create an account" on `/signin` drops `next`, and the sign-up page's Google button gets none.
    - Setting the password and finishing the genres step both go to `/`.
    - The proxy's onboarding redirect drops the original path.
    - So a guest who presses "Sign in to help" ends up on the dashboard.
  - **Do:**
    - Carry `next`, always through `safeNext`: `/signin` → `/signup` → the confirmation link (`/verify?token=…&next=…`) → set password → `/onboarding/username?next=` → `/onboarding/genres?next=` → `next`.
    - When the proxy sends a protected page to onboarding, it adds `?next=`.
    - The Google buttons pass `redirectTo`.
  - **Test:** a flow where a guest on a request page presses Sign in to help, then Create an account, finishes through the mail log, and lands on that request's composer.

- [x] **3.6 — A way out of onboarding** · P1 · S _(2026-10-18: the `(auth)` layout reads the session and, when there is one, shows "Signed in as {email} · Sign out" above every auth and onboarding screen; Sign out is a server action to `/signin`. Flow 1's new test sets a password, sees the line on the username step, signs out and finds the step closed to it (passes against a fresh build).)_
  - **Now:** the `(auth)` layout has no sign-out, and the proxy sends every protected page, `/settings` included, back to onboarding. Someone signed in with the wrong Google account has to take a permanent username before they can leave.
  - **Do:** when someone is signed in, the `(auth)` layout shows "Signed in as {email} · Sign out".
  - **Test:** flow 1 signs out from the username step.

- [x] **3.7 — The username step says why** · FR-1.3 · P2 · S _(2026-10-18: the username form shows the schema's first complaint ("Use at least 3 characters.", "That name is reserved.") or "That name is taken." under the field, in a live region joined by `aria-describedby`; the `pattern` attribute is gone; `autoComplete="off"`; the hint and `maxLength` come from `USERNAME_CHARS`; the warning and its tick stay. The reserved list gains the staff-sounding (moderator, mod, staff, security, official, team), the nobody-sounding (null, undefined, everyone, anonymous, former-member, former-contributor) and every top-level route (about, contact, privacy, terms, rules, new, notifications, suggestions, invitations, onboarding, unsubscribe, forgot-password, reset-password, s, u); `isReservedUsername` exports the check for 3.8. Tests: the new names in `schemas/auth.test.ts`; flow 1 types "ab" and "admin" and reads both reasons (passes against a fresh build).)_
  - **Now (found once):**
    - A refused name only greys out the button; no reason is given.
    - The `pattern` attribute `[a-z0-9-]` is invalid in the browser's `v` mode, so the browser ignores it.
    - `autoComplete="username"` invites password managers to fill in the email address.
    - The reserved list (`lib/schemas/auth.ts`) lacks moderator, staff, official, support, security and the like.
  - **Do:**
    - Show the first validation problem, or "That name is taken", under the field, connected with `aria-describedby`.
    - Escape the hyphen (`[a-z0-9\-]+`), or drop the attribute.
    - Use `autoComplete="off"`.
    - Extend the reserved list: moderator, mod, staff, support, help, security, official, team, system, root, null, undefined, everyone, anonymous, former-member, about, contact, privacy, terms, rules, api, and every top-level route name.
    - Derive "3 to 30 characters" from `USERNAME_CHARS`, and keep the warning that the name is permanent.
  - **Test:** schema tests for the new reserved names, and flow 1 sees a reason.

- [x] **3.8 — Display names can't pose as someone else** · P2 · S _(2026-10-18: `lib/schemas/profile.ts`: `displayNameSchema` strips `\p{Cc}` and `\p{Cf}` (stripped rather than refused, so a name pasted with a stray zero-width character is cleaned, not bounced), collapses whitespace, trims, bounds by `PROFILE_CHARS.displayName` and refuses, ignoring case, "a former member", "a former contributor", "Draftboard", "Draftboard examples/team/staff/support" and any reserved username; `bioSchema` strips the same but keeps line breaks, bounds by `PROFILE_CHARS.bio`, and turns an empty bio into no bio. `settings.updateProfile` uses both and the settings form's lengths come from `PROFILE_CHARS`. Also found: a Google account's name went in untouched (`auth/google.ts`); it now goes through the same rule and is dropped when it fails, and the username step fills the gap as it already did. Tests: `profile.test.ts` (3), a `settings.test.ts` case for the cleaning and the refusal.)_
  - **Now (found once):** the display name is free text up to a hard-coded 80 characters (`routers/settings.ts`). Control and direction-override characters are allowed, and anyone can appear as "a former member" (the deleted-account label, `lib/people.ts`) or as "Draftboard".
  - **Do:**
    - A `displayNameSchema` in `lib/schemas` that trims, collapses inner whitespace, and refuses:
      - `\p{Cc}` and `\p{Cf}` characters, which include direction overrides and zero-width characters
      - names equal, ignoring case, to "a former member", "Draftboard", "Draftboard examples" or a reserved username
    - The bio has the same characters stripped.
    - Lengths come from a new `PROFILE_CHARS` constant.
  - **Test:** schema tests.

- [x] **3.9 — Passwords that hold up** · P1 · S–M · `decision` (D-17, an addendum to 0002) _(2026-10-18: `PASSWORD_RULES` and `passwordSchema` in `lib/schemas/auth.ts`: at least `PASSWORD_CHARS.min` characters with a lower-case letter, a capital, a digit and a symbol, the refusal naming the first one missing; no block list (D-17). `PasswordRules` ticks under the first-password, reset and change-password fields as the person types; every one of those forms has a confirm field and a hidden `autocomplete="username"` field holding the address; `PasswordInput` says "Caps Lock is on". Lengths come from `PASSWORD_CHARS`. Passwords set before stay until changed: sign-in never applies the rule. Every password a flow or a test types now meets it. Tests: the schema's five rules and the first-missing message, spaces and non-Latin letters (2 tests); flows 1 and 11 pass against a fresh build, flow 1 watching the checklist tick.)_
  - **Do (D-17, the owner's rule):**
    - One rule, in `lib/schemas` beside `PASSWORD_CHARS`, used by `setPassword`, `resetPassword` and `changePassword` and by their forms: at least `PASSWORD_CHARS.min` characters, with a lower-case letter, a capital, a digit and a symbol. No list of common passwords.
    - The rule is written under every new-password field as a short checklist that ticks as the person types, and the server's refusal names what is missing: "Add a capital letter."
    - `changePassword` refuses the password already in use, checked against the current hash in the same procedure that checks the old one: "That's the password you already have. Choose a different one."
    - Passwords set before this lands are kept until they are changed; the rule is for new ones.
    - Add a confirm field to the first password (`verify/set-password-form.tsx`), as the reset form already has.
    - Add a "Caps Lock is on" hint to `components/password-input.tsx`, using `getModifierState` with `aria-live="polite"`.
    - Every new-password form gets a visually hidden `autocomplete="username"` field holding the email.
    - Lengths come from `PASSWORD_CHARS`; both password forms hard-code 10 today.
  - **Test:** unit tests for the rule, a router test for the same-password refusal, and flows 1 and 11 still pass.

- [x] **3.10 — "Use a different address"** · P2 · S _(2026-10-18: after the sent message on the sign-up form and on the forgot-password form; it resets the request, not the field, so the address comes back editable. Flow 11 presses it and finds the address still there (passes against a fresh build).)_
  - **Do:** once sign-up or forgot-password says "sent", a button returns to the form with the address kept and editable.

- [x] **3.11 — Signed-in people skip `/signin` and `/signup`** · P2 · S _(2026-10-18: both pages read the session and send a signed-in person to `safeNext(next)`, or home; flow 1's wrong-password test meets the redirect first and signs out to reach the form.)_
  - **Do:** with a valid session, both pages redirect to `safeNext(next)`, or to `/`.

- [x] **3.12 — Old tokens and abandoned sign-ups are cleared** · P2 · S _(2026-10-18: `server/prune.ts`: `pruneDeadTokens` drops confirmation, reset and email-change links used or expired more than `USED_TOKEN_RETENTION_DAYS` (7) ago, keeping the recent dead ones so a late click still gets item 1.16's words; `pruneUnconfirmedAccounts` deletes accounts older than `UNCONFIRMED_ACCOUNT_RETENTION_DAYS` (30) with no confirmed address, no password, no username, the USER role and none of the twenty-five relations a user row can have — the filter is the foreign-key check, and a Google account never qualifies because Google confirms the address. Both run inside the existing daily `prune` job beside the rate-limit rows, which now returns all three counts; the privacy page's "kept for now" line says the two numbers; `docs/05` names the job's new work. Tests: `prune.test.ts` (2) — nine links of three kinds, and four accounts of which only the abandoned one goes, its links with it.)_
  - **Now (found once):** unconfirmed accounts and used or expired tokens are never removed. The daily `prune` (in `CRON_JOBS`, `server/mail/digests.ts`) covers only rate-limit rows.
  - **Do:**
    - The prune deletes confirmation, reset and email-change tokens that are used or expired and more than a week old.
    - It also deletes accounts with no password, no confirmed address and no Google account, created more than `UNCONFIRMED_ACCOUNT_RETENTION_DAYS` ago (a new constant, for example 30). Such an account cannot have written anything, but check every foreign key before deleting.
    - The privacy page says so.
  - **Test:** a prune test.

- [x] **3.13 — Profile pictures, kept small** · FR-9.2 · P1 · M · `migration` · (D-5) _(2026-10-18: decision 0048. `UserAvatar { userId, bytes, contentType, updatedAt }` in `20261018040000_user_avatars`; `User.avatarUrl` stays, commented as unused. `server/avatars.ts` `shrinkAvatar` with `sharp`: reads the bytes as an image whatever the upload called itself, refuses anything but JPEG, PNG or WebP, turns it by its EXIF, cuts a centred square and shrinks it to `AVATAR.sizePx` (96) as WebP. `POST /api/avatar` checks who is asking before decoding anything, takes `AVATAR.maxUploadBytes`, shrinks, and hands the icon to `settings.setAvatar`, which is behind `activeProcedure`, rate-limited (`AUTH_LIMITS.avatarUploadsPerAccountPerHour`), shrinks again before storing and refuses anything over `AVATAR.maxStoredBytes`; `settings.removeAvatar` deletes the row. `GET /u/[username]/avatar?v=<updatedAt>` serves the bytes immutable for a year with `nosniff`, 404 uncached when there is none or the account is deleted. `components/initials-avatar.tsx` (two initials on one of five tones picked by the username, `aria-hidden`) and `components/user-avatar.tsx` (the picture or the initials, `alt=""`); `lib/people.ts` gains `avatar`, `avatarSrc`, `initialsOf`, `toneIndexOf`. Shown in the header (`user.avatar`), the contributors page, idea threads, suggestion lists, the profile and settings, each query selecting `avatar: { updatedAt }` beside the name; settings has "Change picture" and "Remove picture" (`settings/profile-picture.tsx`). The purge deletes the row in the same transaction as the name. `sharp` added to the catalog and the app. The contributors strip (7.3) will draw it from the same select. Seed: unchanged on purpose — the example accounts have no picture, which is the initials fallback in use. Tests: `avatars.test.ts` (3: a 2400×1600 PNG comes out 96×96 WebP under the bound, the shrink is stable, SVG/text/GIF refused), `api/avatar/route.test.ts` (4: a stranger is refused before decoding, too big/not a picture/none, stored and served with the headers, a suspended account refused by the procedure's gate), the purge test gains the row; the new `profile-picture.spec.ts` flow uploads a not-a-picture and a photo, reads the icon back from the header's URL and checks it is 96×96 WebP, finds it on the profile, removes it and sees the initials return (passes against a fresh build, with flows 3-4-5, 10 and the accessibility checks).)_
  - **Now:** `User.avatarUrl` exists, and nothing sets or shows it. The deletion screen still promises to erase your "picture".
  - **Do:**
    - Add `components/initials-avatar.tsx` as the fallback: up to two initials, on a background from a fixed set of tokens chosen by a hash of the username. It is decorative and `aria-hidden`; the name is always written beside it.
    - Uploads (D-5): a route handler takes a JPEG, PNG or WebP of at most `AVATAR.maxUploadBytes`, checks that the bytes are an image, cuts it to a centred square and shrinks it to `AVATAR.sizePx` (an icon, not a portrait) as WebP, with `sharp`. The result, a few kilobytes, lives in `UserAvatar { userId, bytes, contentType, updatedAt }` and is served from `/u/[username]/avatar` with a long cache and a version in the query string. No object store, no new account.
    - Settings gains "Change picture" and "Remove picture"; the purge (decision 0024) deletes the row, which makes the deletion screen's promise true.
    - Show the picture, or the initials, in the header, the contributors strip (7.3), the contributors page, idea threads, suggestion lists and profiles.
    - `avatarUrl` stays unused; say so in the schema comment.
  - **Test:** a unit test for the resize (a large PNG comes out at the size and under the byte bound), a route test for the limits, and the purge test gains the row.
  - **Needed by:** 7.3.

- [x] **3.14 — Download my data** · P2 · M _(2026-10-18: `GET /api/export/account` returns one zip from `server/export/account.ts`: `account.json` (profile, address, genres, preferences, dates, whom you blocked), `stories/<title>.md` for every story you own through the same exporter as the download button, `suggestions.json` and `ideas.json` with your own words and the story and request named only where `visibleStoryboardsWhere` still lets you read that story, `credits.json` and `reports-made.json`. The zip writer is the `.epub` one, exposed as `zipFiles`/`unzipFiles` from `@storyboard/export`. The route takes the session, allows an account in its deletion grace or suspended (its own data is the one thing it should certainly have), and takes `AUTH_LIMITS.dataExportsPerAccountPerDay` (1) after those checks (decision 0037). `components/download-data.tsx` fetches rather than links, so a refusal reads as a sentence and not as JSON; it sits on the deletion screen before the button, in both of its states. Tests: `api/export/account/route.test.ts` (2): a stranger is refused; a person with a public story, an idea and a credit on somebody's private story, a report and a block gets exactly six files, the Markdown holds the section, the private story's name is withheld from the idea and its credit while their own story's is given, and the second download in a day is refused with the "recently" sentence. Flow 10 passes against a fresh build with the new offer on its screen.)_
  - **Do:**
    - Settings gains "Download your data", served by `/api/export/account`.
    - It returns a zip, reusing the `.epub` zip writer, containing:
      - `account.json`: profile, email, genres, preferences, dates
      - the stories they own, as Markdown of the main draft, using the existing exporter
      - `suggestions.json` and `ideas.json`: their own words, with story titles only where they can still read the story
      - `credits.json` and `reports-made.json`
    - One download a day. Take the limit after validation, so a refusal costs nothing (decision 0037).
    - The deletion screen offers the download before its button.
  - **Test:** route tests for the contents, the permissions and the limit.

- [x] **3.15 — A default visibility for new stories** · screen 16 · P2 · S · `migration` _(2026-10-18: `User.defaultVisibility Visibility @default(PUBLIC)` in `20261018041000_default_visibility`; `settings.setDefaultVisibility` and a "New stories start as" control in settings (`settings/default-visibility.tsx`), saying it only decides which option is already selected. The create form reads it through `user.me` (prefetched by the page) and the import through a `defaultVisibility` prop from its page; both still show FR-13.6's words beside the choice, and the import no longer starts on Private regardless. It is in `account.json` too. Test: `settings.test.ts` round-trips it.)_
  - **Do:** add `User.defaultVisibility`, PUBLIC by default, with a control in settings. The create form and import start from it, and the FR-13.6 copy still shows when creating.

- [x] **3.16 — Sign-in methods shown in settings** · P3 · S · `migration` _(2026-10-18: the product had no record of whether Google had ever signed an account in, so `20261018042000_google_sign_in_state` adds `User.googleLinkedAt` (set when Google creates or first links an account; backfilled from `createdAt` for confirmed accounts with no password, which can only have come from Google) and `User.googleDisconnectedAt`. "Sign-in methods" in settings (`account-security.tsx`) shows the password as set or not and Google as connected since a date, not used yet, or turned off; "Disconnect Google" is offered only with a password, and `settings.setGoogleSignIn` refuses without one ("Set a password first. Without one, Google is your only way in."). Disconnecting has to mean something when linking is by address alone, so `resolveGoogleUser` refuses a disconnected account and the `signIn` callback sends it to `/signin?error=AccessDenied&code=google_off`, the one Google refusal said plainly (Google has verified that whoever is asking owns the address): "Google sign-in is turned off for this account…". "Allow Google sign-in again" clears it; nothing is linked until Google next signs the account in. Tests: `settings.test.ts` (refused without a password, off and on), `google.test.ts` (remembered for new and existing accounts; a disconnected one refused and left unlinked), `sign-in-error.test.ts` (the sentence).)_
  - **Do:** "Sign-in methods" shows the password (set or not) and Google (connected or not). Disconnecting Google is offered only when a password exists.

---

## 4. Phones, loading and getting around

All P1.

_Milestone closed 2026-10-18, 10 of 10. Closing run on the local database, shared with milestone 5's: typecheck, lint and vocabulary clean; 739 tests in 74 files (app 574 in 61, db 30 in 6, import 47, compare 33, export 23, ui 3, root scripts 29); all 54 browser flows across the two Playwright projects (52 in the full run, and two whose expectations the day's work had changed — flow 8's fourth suggestion now meets item 6.4's disabled Send instead of a refusal, and flow 9 asks Browse for a seeded title by name on a long-lived database — corrected and passed on their own). Found on the way: a `loading.tsx` boundary turned every private-story 404 into a 200 and left streamed pages' content twice in the document, so 4.6 ships the pending bar and no page-level loading files; the upheld and dismissed report lists read newest first; `request.reopen` could open a request on a removed section. Production needs the migrations listed in `04-phase-plan.md`'s Current position._

- [x] **4.1 — One header, everywhere** · S–M _(2026-10-18: `components/site-header.tsx`, a server component that reads the session (or takes it from a layout that has it), the unread count, pending invitations, the viewer's picture and the admin link, and carries the deletion banner. Members get Browse, Start a story, Your suggestions, Invitations with a count when any are pending, Notifications with the unread count, Settings, Admin when allowed, their picture and name, and Sign out (`site-header-actions.ts`); guests get the wordmark pointing at Browse, Browse, Sign in and Create an account. It is rendered by the `(app)` layout and by four new layouts: `s/[slug]/(story)` (contents, settings, comparison, contributors, lineage, versions, export, co-authors moved into the group), `s/[slug]/help` (beside it, the same layout), `s/[slug]/c/[chapter]/[section]/(tools)` (the editor and history, moved) and `u` (profiles and credits), plus `(public)` for the rules, contact, privacy, terms and unsubscribe pages, which moved into that group. The reader keeps its own header and gains `components/account-menu.tsx` at its end — Browse, the picture and name, Sign out — and its wordmark goes to Browse for a guest (part of 4.10). Test: the new `header.spec.ts` reads the guest header on the rules page, then as a member checks contents, contributors, versions, the profile, the rules and contact pages for the wordmark pointing home, Your suggestions, Notifications and Sign out, and the reader for Browse, the name and Sign out (passes against a fresh build, with flows 3-4-5, 6, 8, 12 and 14 and the accessibility checks).)_
  - **Now:** the `(app)` layout has the only site header. The story sub-pages have none, and neither do profiles or `/rules`, so they are dead ends with no notifications and no sign-out. The sub-pages are contents, settings, the help pages, comparison, contributors, lineage, versions, history, export and co-authors.
  - **Do:**
    - Extract `components/site-header.tsx`, a server component that reads the session, the unread count and the admin flag.
    - Use it in the `(app)` layout, and on every page outside it except the reader and the auth pages.
    - Add "Your suggestions" (`/suggestions`), "Invitations" when some are pending, and "Admin" for admins.
    - The reader's own header gets the same account menu and Browse.
    - The guest version: the wordmark goes to `/browse`, with Browse, Sign in and Create an account.
    - It carries the deletion banner (1.5).

- [x] **4.2 — A menu at phone width** · S _(2026-10-18: `components/header-menu.tsx`, a disclosure and nothing more: below `sm` the site header's links sit behind one "Menu" button with `aria-expanded` and `aria-controls`; Escape closes it and puts focus back on the button; a link or Sign out followed closes it; from `sm` up the wrapper is `display: contents`, so the links lay out in the nav's own row as before. No library. Test: `header.spec.ts` at 390 px opens it, reads the state, presses Escape, checks the focus, then widens to 1024 px and finds the row (passes against a fresh build).)_
  - **Do:** below the `sm` breakpoint, the header's links fold into a "Menu" disclosure button. It sets `aria-expanded`, Escape closes it, and focus returns to the button. No library.

- [x] **4.3 — The reader on phones and tablets** · M _(2026-10-18: below `md` the reader's header keeps one action in view — Ask for help for an author, Sign in to help for a guest — and folds the rest behind "More" (`HeaderMenu` with `from="md"`): the reading settings, Contributors, Your own version, Versions, Co-authors, Take it out, Contents, Settings and the account end; from `md` up it is the row it was. Below `lg` the contents rail is gone and a "Chapters" button at the top of the manuscript opens the same list (`ChapterList`, one component for both, `wide="hidden"` so nothing doubles at `lg`); 7.2's request markers will land in it once. Request cards were already inline. Test: `mobile.spec.ts` opens More, finds Contents, closes it with Escape, opens Chapters and finds the links.)_
  - **Now (found once):** the reader's header is a row of up to nine buttons that never wraps, so it overflows at phone width. The contents rail is `hidden … lg:block`, with nothing in its place below 1024 px.
  - **Do:**
    - Below `md`, the header's actions go into a "More" menu: Contents, Versions, Export, Your own version, Report and the reading settings.
    - Below `lg`, a "Chapters" button opens the chapter list. It uses the rail's component, with 7.2's request markers.
    - Request cards stay inline below `lg`.

- [x] **4.4 — The comparison stacks on small screens** · FR-7.1 · S _(2026-10-18: `ComparisonView`'s side-by-side grid is two columns from `md` up and one below; the column heads hide below `md` and each cell carries its own label there ("{left}" / "{right}", the names the page passes). The read-straight toggle is untouched. Test: `mobile.spec.ts` measures the first two cells and finds the second under the first, not beside it.)_
  - **Do:** two columns from `md` up. Below that, one column, each row labelled "Your text" or "{name}'s version". The read-straight toggle is unchanged.

- [x] **4.5 — The editor and composer at phone width** · S _(2026-10-18: the section editor's toolbar wraps (`flex-wrap`) and stays sticky. The composer's "What the author asked for" — the constraints with their private ticks, and the tone — is one piece of JSX rendered twice: below `lg` first in the grid, as a `details` open by default above the editor and never under Send; from `lg` up pinned beside the prose as before. Both copies share one checked-set, so a tick made in one is the tick in the other.)_
  - **Do:** the toolbar wraps and stays sticky. Below `lg`, the composer's constraints become a collapsible panel above the editor, open by default, and never below the Send button.

- [x] **4.6 — Loading states** · S–M _(2026-10-18: `components/link.tsx` renders a `PendingBar` inside every link — `useLinkStatus`, a two-pixel bar across the top of the window while the followed page is on its way, pulsing only under `motion-safe` — so a click is never silent. The skeletons were built as `loading.tsx` for `(app)`, `s/[slug]` and `u/[username]` and taken out again the same day: a `loading.tsx` is a Suspense boundary, so a page that decides `notFound()` after its data (every private story to a stranger, every profile, the admin screens) is sent as a 200 with the 404 drawn afterwards, and flows 2 and 8 rightly failed on the status; and with the boundary in place the streamed pages left a second, hidden copy of their content in the document, which the strict locators found. NFR-6's 404 is worth more than a skeleton; the bar does the skeleton's job.)_
  - **Now:** there is no `loading.tsx`, no Suspense boundary and no pending indicator, so on a cold start a click looks dead.
  - **Do:**
    - `loading.tsx` skeletons for `(app)`, `s/[slug]` and `u/[username]`: tokens only, `aria-busy`, no layout shift.
    - A pending state in `components/link.tsx`, using Next's `useLinkStatus`: a thin bar at the top that respects reduced motion.

- [x] **4.7 — Error pages** · S _(2026-10-18: `app/global-error.tsx` with its own `<html>` and `<body>` and inline styles, since the root layout that failed provided none: "Something went wrong on our side, not yours", Try again, and the digest; `s/[slug]/error.tsx` with Back to the story (from `useParams`) and Browse as plain anchors, because a client-side transition would ask the thing that broke to navigate; a marketing `not-found.tsx` in `apps/web`; the app's 404 now says "If it's private, ask its author to invite you as a co-author" and offers Sign in to a guest and the dashboard to a member.)_
  - **Now:** there is no `global-error.tsx`, no segment error page and no marketing 404. The app's 404 tells people to ask for access "from its settings", but invitations live on the co-authors page.
  - **Do:**
    - App `global-error.tsx`: its own `<html>` and `<body>`, "Something went wrong on our side, not yours", and Try again.
    - `s/[slug]/error.tsx`, with a way back to the story.
    - A marketing `not-found.tsx`.
    - The 404 copy: "If it's private, ask its author to invite you as a co-author." It links to Browse for guests and to the dashboard for members.

- [x] **4.8 — One skip link, and one `main`, on every page** · NFR-4 · S _(2026-10-18: the skip link moved to the root layout; the `(app)` layout's `<div id="main">` is gone; every page has exactly one `<main id="main" tabIndex={-1}>` — thirty-nine files swept, the create form and the reader shell among them, the `(auth)` layout's own, and the pages with branches (email change, unsubscribe) one per branch. Test: the accessibility spec's new test visits Browse, the seeded story, a profile, the rules and a request, counts one `main` and one `#main`, presses the skip link and finds the main focused (passes against a fresh build).)_
  - **Now:** the skip link exists only in the `(app)` layout; the reader, request, editor and profile pages have none. The `(app)` layout's `<div id="main">` wraps pages that render their own `<main id="main">`, so the id appears twice.
  - **Do:**
    - Put the skip link in the root layout.
    - Every page has exactly one `<main id="main" tabIndex={-1}>`.
    - Remove the id from the layout's div.
  - **Test:** the accessibility spec checks for one `#main` and a working skip link on the reader, browse, a request and a profile.

- [x] **4.9 — Phones in the browser tests** · S _(2026-10-18: `playwright.config.ts` has two projects — `chromium` (Desktop Chrome, everything not tagged `@mobile`) and `mobile` (`devices['Pixel 7']`, only what is). `mobile.spec.ts` covers the header menu, the reader's More and Chapters, the stacked comparison, and `scrollWidth <= innerWidth` on Browse, the dashboard, settings, a story, a request and a comparison; the editor helpers (`writeInEditor`, `passage`) and a new `sendSuggestion` moved to `helpers.ts` for it. CI runs `pnpm e2e`, which runs both projects; nothing in `ci.yml` named the project.)_
  - **Do:**
    - Add a Playwright project `mobile`, using `devices['Pixel 7']` and running the specs tagged `@mobile`.
    - `mobile.spec.ts` covers the header menu, the reader's chapters, the stacked comparison, and no horizontal scroll (`scrollWidth <= innerWidth`) on `/`, `/browse`, a story, a request, a comparison and settings.
    - Make sure CI runs both projects (check `.github/workflows/ci.yml`).

- [x] **4.10 — Guests can always get back to reading** · FR-1.2 · S _(2026-10-18: for a guest the reader's wordmark, the site header's wordmark, the rules page's "Back to Draftboard" and the 404's way on all go to `/browse`; the reader shows a guest Browse (the account menu) beside "Sign in to help"; the marketing header gains "Browse stories" and "Sign in", pointing at the application. `header.spec.ts` reads the rules page's link and the wordmark as a guest.)_
  - **Now:** the reader's wordmark (`s/[slug]/reader.tsx`), the rules page's "Back to Draftboard" and the 404's link all go to `/`, which needs an account. The reader offers guests no Browse, and the marketing header has no Browse or Sign in.
  - **Do:**
    - For guests, those links go to `/browse`.
    - The reader shows guests Browse and Sign in.
    - The marketing header adds "Browse stories" and "Sign in", pointing at the app.

---

## 5. Confirm before anything is lost

_Milestone closed 2026-10-18, 8 of 8, in the same closing run as milestone 4 (above): one dialog on the native `<dialog>`, in front of closing, going private, passing, withdrawing, restoring, joining and removing, each with the server's own numbers; the way back for removed chapters and sections; a history address for what was removed or joined away._

- [x] **5.1 — One confirmation dialog** · P1 · S _(2026-10-18: `components/confirm-dialog.tsx` on the native `<dialog>` and `showModal`: a title, the consequences in plain words as children, focus starting on the safe button ("Keep it as it is"), Escape cancelling through `onCancel` so the caller's state agrees, a `busy` state that holds both buttons while the consequences load or the action runs, and a confirm button that names its consequence. Controlled by `open`; it commits nothing itself. `lib/impact-words.ts` gives every dialog the same sentences for the server's numbers.)_
  - **Now:** the app has no `<dialog>`. Confirmations are inline checkboxes, or nothing.
  - **Do:** `components/confirm-dialog.tsx`, built on the native `<dialog>` with `showModal`:
    - a title, and the consequences in plain words
    - focus starts on the safe button, and Escape cancels
    - the confirm button names its consequence ("Remove chapter and 3 sections")
    - consequences come from the server where the server knows them

- [x] **5.2 — Removing and joining ask first, and say what follows** · FR-2.4 · P1 · S–M _(2026-10-18: `server/impact.ts` counts what `close-requests.ts` would close and whom it would tell, without doing it; `chapter.removalImpact` (sections, words, open requests, people) and `section.removalImpact` (words, open requests, people) read with the structure right. The contents page's Remove and "Join with the one above" open the dialog with "Its 3 sections and 1,204 words leave the story" or "move into the section above", then "2 open requests close, and Maya and Leah will be told", and a button that says "Remove the chapter and 3 sections". Once 5.7 lands the dialog adds the way back. Tests: `impact.test.ts` (open and answered requests counted, a person on two requests named once, withdrawn and closed ignored); `confirm.spec.ts` joins and removes sections and removes a chapter whose request a helper is drafting on, reading each sentence (passes against a fresh build).)_
  - **Do:**
    - Add `chapter.removalImpact` and `section.removalImpact`: sections, words, open requests that will close, and people who will be told. `storyboard.deletionImpact` is the pattern.
    - Use them in dialogs for removing a chapter, removing a section, and joining a section into the one above. Once 5.7 lands, the dialogs add "You can bring it back from Removed within 30 days".

- [x] **5.3 — Restoring asks first** · FR-8.4, FR-8.5 · P1 · S _(2026-10-18: `section.restoreImpact({ sectionId, revisionId })` names the contributors whose live credits sit on revisions the restored text does not stand on — the same rule `restoreRevision` unlinks by — and nobody for an alternate version. The history page's "Restore this version" opens the dialog: what the section goes back to, that the current text stays in the history, and either "Nobody else's accepted words are affected" or the names and that they will be told. The reason chips arrive with 8.14, which is where they are defined. `confirm.spec.ts` restores an older version through it.)_
  - **Do:** add `section.restoreImpact({ revisionId })`, which names the contributors whose accepted words would leave the main draft. The dialog says they will be told, and offers the reason chips from 8.14.

- [x] **5.4 — Making a story private asks first** · FR-2.7 · P1 · S _(2026-10-18: `storyboard.privacyImpact` with the `setVisibility` right; "Make it private" in the story's settings opens the dialog with "1 open request closes, and Maya will be told" (or that none are affected) and that what is written while private stays private; making it public still asks nothing (decision 0007). `confirm.spec.ts` reads the sentence and keeps the story public.)_
  - **Now (found once):** making a story private is one click in its settings, yet it closes every open request and emails their helpers. Marking a story finished has the same effect, and does ask (`finished-switch.tsx`).
  - **Do:** a dialog with the number of open requests and of people who will be told.

- [x] **5.5 — Closing a request asks first** · FR-5.10 · P1 · S _(2026-10-18: `request.closeImpact`; "Close this without accepting" / "Close this request" opens the dialog with "1 person with a draft or a waiting suggestion will be told: Maya" (or that nobody is waiting) and that it can be opened again; `request.close` lost its unused `reason` input. `confirm.spec.ts` cancels once, then closes and reopens.)_
  - **Do:**
    - A dialog: "{n} people with a draft or a waiting suggestion will be told."
    - Remove `request.close`'s `reason` input, which nothing uses.

- [x] **5.6 — Passing and withdrawing ask first** · FR-6.5, FR-6.10 · P1 · S _(2026-10-18: "Go a different way" opens the dialog with the four optional chips, each one click, the sentence about who is told, and "Pass on it"; the inline panel it replaces is gone. "Withdraw" opens the dialog ("It frees a slot… You can start a new draft from it afterwards") with "Withdraw it"; afterwards the list says Withdrawn and offers "Start a new draft from it", which calls `suggestion.startDraft` with `from`: the withdrawn suggestion's words and note seed the new draft (the server checks it is the caller's own, withdrawn, on this request). "Change it instead" joins once 6.7 lands. `confirm.spec.ts` passes with a chip, withdraws, starts the new draft and finds the words in the composer.)_
  - **Do:**
    - **Pass** opens a small dialog with the four optional chips, each one click, and a "Pass on it" button.
    - **Withdraw** asks first: "It frees a slot. You can start a new draft from it."
      - "Start a new draft from it" copies the withdrawn suggestion's words into a new draft.
      - While the suggestion is unopened, the dialog also offers "Change it instead" (6.7).

- [x] **5.7 — Bring back a removed chapter or section** · decision 0008 · P2 · M _(2026-10-18: `chapter.removed({ versionId })` lists what left this version in the last `SOFT_DELETE_GRACE_DAYS` — chapters with their section and word counts, and sections whose chapter is still in the story — and the Contents page shows it as "Removed in the last 30 days" with "Bring it back" per row (`contents/removed-list.tsx`). `chapter.restore` clears the chapter and the sections removed with it (same instant) and puts the chapter at the end of its version; `section.restore` puts the section at the end of its chapter; both keep the lineage, refuse a deleted version (item 1.1) and the grace's end, and the section one refuses a joined-away section and a section whose chapter is still removed (it comes back with the chapter). Requests closed by the removal stay closed; the removal dialog now says so and names the way back. Found on the way: `request.reopen` would open a request on a removed or joined-away section again; it now refuses. Tests: two integrity tests (a section back at the end, a chapter back with its sections and at the end, the joined-away and deleted-version refusals); `confirm.spec.ts` removes a chapter with a request on it, finds the reopen refused, brings the chapter back and finds its section listed again (passes against a fresh build).)_
  - **Do:**
    - The Contents page lists "Removed in the last {SOFT_DELETE_GRACE_DAYS} days", each with "Bring it back".
    - That calls `chapter.restore` or `section.restore`, which clear `deletedAt` and place the item at the end of its chapter (a chapter at the end of its version). The lineage is unchanged.
    - A chapter comes back with its sections.
    - Requests closed by the removal stay closed, and the dialog says so.
    - Nothing in a deleted version (1.1) can come back this way.
  - **Test:** an integrity test, and a step in flow 7.

- [x] **5.8 — The history of removed and joined-away sections** · FR-2.4, FR-8.2 · P2 · M _(2026-10-18: `/s/[slug]/sections/[sectionId]/history`, by id rather than position, with the same `HistoryPanel`, the same `section.history` (public, private stretches included) and the restore buttons away for anything no longer in the story. `section.whereabouts` says where a section is or was — its chapter, removed or joined into what and when, the sections joined into it — read with the story's read right, and the page refuses an id from another story. The positional history page lists "Joined from ‘Vessel’ on 12 Oct — its earlier versions" for each section it absorbed, and the Removed list links the same page. `confirm.spec.ts` follows the link from the absorbing section's history and reads the joined-away section's page.)_
  - **Now (found once):** addresses are positions among live sections (`server/places.ts`), so a removed or joined-away section's earlier versions have no address at all. Decision 0008 says they stay addressable.
  - **Do:**
    - Add `/s/[slug]/sections/[sectionId]/history`, with the same component and the same permissions as today's history, private stretches included.
    - Link it from the Removed list (5.7), and from the history of a section that absorbed another ("Joined from 'Vessel' on 12 Oct — its earlier versions").

---

## 6. The help loop, complete

- [x] **6.1 — Edit a request** · `02-architecture.md` §6 `request.update` · P1 · M · `migration` _(2026-10-18: `request.update` for the story's authors while the request is OPEN or ANSWERED and the story is not finished: title, ask, story so far, tone and character notes, rules, reading and word bounds, through `updateRequestSchema`, built from the same field schemas as opening (the story-so-far minimum is checked by the router, which knows the kind). Never the kind, never the section. `ContributionRequest.editedAt` in `20261018043000_request_edits`; the request page says "edited 18 Oct" and offers the authors "Change this request", which leads to `/help/[request]/edit`: the open-request form with an `edit` prop, filled in, the kind and section fixed, "Save the changes". No notifications. Tests: an integrity test (a stranger refused, the author's change recorded with `editedAt`, the story-so-far and bounds rules still held, a closed request refused); `request-edit.spec.ts` changes a title and the character notes and reads both on the page and in a helper's composer (passes against a fresh build).)_
  - **Now:** the only way to fix a typo, add a constraint or widen the word range is to close the request, which emails everyone with a draft.
  - **Do:**
    - `request.update`, for the story's authors only, while the request is OPEN or ANSWERED and the story isn't finished.
    - It edits the title, ask, pre-context, tone notes, character notes (6.2), constraints, suggested reading and word bounds, using the schemas `create` uses. Never the kind, and never the section.
    - Add `editedAt`, and show "edited {date}" on the request page.
    - No notifications. New word bounds apply to anything sent from now on.
    - The edit page reuses the open-request form.
  - **Test:** router tests for permissions, states and bounds, and a flow step.

- [x] **6.2 — Character notes, separately** · FR-5.6 · P2 · S · `migration` _(2026-10-18: `ContributionRequest.characterNotes` (same migration as 6.1), its own "Character notes" field in the form, its own "Characters" heading on the request page and in the composer's side panel; "Tone and character notes" is "Tone notes" again. Older requests keep what they wrote under tone. Covered by `request-edit.spec.ts`.)_
  - **Now (found once):** character notes are merged into tone notes (`open-request-form.tsx`), and the composer labels the box only "Tone".
  - **Do:** add `ContributionRequest.characterNotes`, with its own form field and its own heading on the request page and in the composer.

- [x] **6.3 — The composer shows the ask, the constraints and your allowance** · FR-5.6, FR-13.2, prototype · P1 · M _(2026-10-18: the composer now gets the ask and shows it under the title, folded behind "Read all" past `REQUEST_ASK_PREVIEW_CHARS`; the constraints stay the checklist (sticky from `lg`, above the editor below it, 4.5). `suggestion.allowance({ storyboardId })` reads what `submit` enforces — the person's suggestions waiting on the story against decision 0016's tier, and the day's sends left from `DAILY_LIMITS` — and the footer says "1 of your 3 suggestions waiting on this story · 9 sends left today" (`lib/allowance-words.ts`; "no cap" on your own story). Tests: an integrity test (a reader's quota of 3, a draft waiting on nobody, a sent one counted, the owner's `null`); `request-edit.spec.ts` reads the line and opens the ask.)_
  - **Now (found once):** the composer page doesn't pass the ask (`help/[request]/write/page.tsx`), and the prototype's "2 of your 3 open suggestions" appears nowhere.
  - **Do:**
    - At the top: the request's title and ask, showing the first lines with "Read all".
    - The constraints as a checklist, sticky from `lg` up; see 4.5 for smaller screens.
    - In the footer: "{n} of your {quota} suggestions waiting on this story · {m} sends left today". This comes from a new `suggestion.allowance({ storyboardId })`, using decision 0016's tiers and `DAILY_LIMITS`.

- [x] **6.4 — Know before you write** · FR-13.2 · P1 · S _(2026-10-18: the request page shows the same allowance line under "Write a suggestion" for a signed-in helper; with the quota full the button still opens a draft, the line adds "You can write now and send when one of your 3 is decided", and the composer's Send is off with that sentence under it. The server is unchanged: `submit` still decides. `request-edit.spec.ts` reads the line on the request page.)_
  - **Do:**
    - The request page shows the allowance beside "Write a suggestion".
    - When the quota is full, the button still opens a draft, and says "You can write now and send when one of your 3 is decided."
    - Send is disabled with that reason. The server is unchanged.

- [x] **6.5 — Your drafts, findable and removable** · FR-4.5, FR-6.1 · P1 · S–M _(2026-10-18: `suggestion.listMine` now includes drafts and stale ones, with `updatedAt`; `/suggestions` splits them (`suggestions/drafts.tsx`): "Not sent yet" — each draft with its story and request titles where still readable, when it was last saved, Continue and Throw away, which asks first ("Its words go for good. Nobody has read it, and nobody is told.") and calls `suggestion.discardDraft`, which deletes only the caller's own DRAFT (a sent one is withdrawn, and says so); "Needs updating" — stale ones with "Update it", which moves the base and opens the composer; then what was sent, as before. Tests: an integrity test (another person refused, the owner's draft gone, a sent one refused); `drafts.spec.ts` finds the draft, continues it, throws it away through the dialog (passes against a fresh build).)_
  - **Now:** `suggestion.listMine` leaves drafts out, so `/suggestions` never shows them, and a suggestion draft cannot be thrown away.
  - **Do:**
    - `/suggestions` gains "Not sent yet": each draft with its story and request titles where they are still readable, when it was last saved, Continue, and Throw away.
    - It also gains "Needs updating": stale suggestions, each with Update it.
    - `suggestion.discardDraft` deletes only the caller's own DRAFT, after the dialog.

- [x] **6.6 — A draft written against old text says so** · FR-6.3, FR-6.7 · P2 · S _(2026-10-18: the composer page passes the draft's base and the section's current revision; when they differ the composer says "The section has changed since you started", offers "What changed" (`RevisionComparison` from the base to the head, "When you started" against "Now") and "Update my draft to the new text", which calls `suggestion.rebase` — now allowed on a DRAFT as well as a STALE one, moving the base and leaving the words alone, which the banner says for a rewrite. Sending a draft that is still behind asks first ("Send it against the new text?"). Tests: an integrity test (the author commits a new revision, the helper's draft moves its base to it and keeps its text); `drafts.spec.ts` has the author change the section while the draft is open, reads the banner, opens what changed and updates the draft (passes against a fresh build).)_
  - **Now (found once):** `startDraft` reopens a draft with its original base, and nothing warns the helper. `rebase` works only on stale suggestions.
  - **Do:**
    - When a draft's base is no longer the current text, the composer shows "The section has changed since you started." It offers "What changed", a comparison from the base to the head, and "Update my draft to the new text".
    - Allow `rebase` on a DRAFT, so that it moves the base. For a rewrite, the helper's words are not changed for them; say so.
    - Sending such a draft asks first.

- [x] **6.7 — Change a sent suggestion until an author opens it** · P2 · M · `migration` · `decision` (D-12) · needs 1.10 _(2026-10-18: `suggestion.edit` for its writer while it is SUBMITTED and `openedAt` is null, as one conditional write (`updateMany` on state and `openedAt`), within the request's word bounds, costing neither the quota nor the day's sends; `Suggestion.editedAt` in `20261018044000_suggestion_edited`. The helper's row offers "Change it" until an author opens it, which leads to the composer at `/write?change=<suggestion>`: nothing autosaves there, Send is "Save the change", a full quota does not stop it, and an opened suggestion meets "The author has started reading it, so it can't change now. Withdraw it and send a new one." The withdraw dialog offers "change it instead" while unopened (5.6's last line). "Edited" with the time wherever the suggestion is shown: the list, its page, your suggestions. The comparison is computed on request and cached nowhere, so nothing was to clear. Tests: an integrity test (a stranger refused, the change recorded with `editedAt`, the bounds held, the opened race refused with the sentence); `drafts.spec.ts` changes a sent suggestion, reads "edited", has the author open it and finds the way closed (passes against a fresh build).)_
  - **Do:**
    - `suggestion.edit`, for its writer, while it is SUBMITTED and `openedAt` is still null, as a conditional update, within the word bounds.
    - It costs neither the quota nor the daily limit.
    - The helper's view offers "Change it".
    - A suggestion changed after it was sent carries "Edited" with the time wherever it is shown (D-12): `Suggestion.editedAt`, set by `suggestion.edit`.
    - Once an author has opened it: "The author has started reading it, so it can't change now. Withdraw it and send a new one."
    - If the suggestion's comparison is cached anywhere (check `compare.ts`), clear that cache on edit.
  - **Test:** router tests, including a race between editing and opening.

- [x] **6.8 — Ideas: change them, remove them, see when they came** · FR-6.9 · P2 · M · `migration` · (D-7) _(2026-10-18: `Idea.editedAt` and `Idea.deletedAt` in `20261018045000_idea_edits`. `idea.edit` within `IDEA_EDIT_MINUTES` (15) of posting and not once marked as helped, as one conditional write; `idea.remove` for your own idea that is not the one that helped, after which it reads "Removed by its writer" and its replies stay. Every idea and reply shows when it came (item 1.18's zone) and "edited" when it was changed; "Change" opens the words in place with a counter, "Remove" asks first. Replies take 1 to 400 words (`IDEA_REPLY_WORDS`, D-7; `ideaReplySchema`, chosen by the server from whether there is a parent); both boxes count live and say why Send waits. The guest's line is a link to sign in with `next`. Tests: `idea.test.ts` (a stranger refused, the change recorded, a one-word reply taken and a short idea refused, the window, removal with the reply kept, the helped one immovable); flow 14 changes the idea, has the author reply in three words, and removes the idea after the request closes (passes against a fresh build).)_
  - **Now (found once):**
    - An idea can't be edited or removed, and no times are shown.
    - A reply needs 20 words, and the reply box has no counter.
    - A guest's "Sign in to add an idea." isn't a link.
  - **Do:**
    - `idea.edit`, within `IDEA_EDIT_MINUTES` and not after it is marked as helped, sets `editedAt`.
    - `idea.remove`, for your own idea that isn't marked as helped, sets `deletedAt`. The idea then reads "Removed by its writer", and its replies stay.
    - Dates as in 1.18.
    - Replies take 1 to 400 words (D-7, a new constant `IDEA_REPLY_WORDS`).
    - Live counters on both boxes, with the reason shown when Send is disabled.
    - The guest's line links to sign-in with `next`.

- [x] **6.9 — Notifications you can work through** · FR-12.1, FR-12.2, FR-6.10 · P1 · M _(2026-10-18: `notification.markRead({ ids })` marks your own rows only. Opening a row marks it read and then goes where it leads (a click meant for a new tab is left to the browser); a row that leads nowhere has "Mark as read"; both, and "Mark all as read", refresh the header's count. `notification.list` pages by cursor, `NOTIFICATION_PAGE` (30) at a time, newest first with the id as the tie-break; a cursor that is not yours is no cursor; "Show older" fetches the next page; the unread line is the server's count over every row. `notification-targets.ts` now also says who acted and which chapter the passage is in, read when the row is read: off the suggestion's decider or writer, the accepted suggestion's decider for a stale one, the idea's or reply's writer, the restoring revision's writer, the invitation's sender, the spin-off's owner, or `byId`, which rows written since carry where nothing else records it (reopened, closed by an author, marked as helped, invitation accepted); only where the story can be read; `nameOf` for the name, so an erased account is "a former member". `sentenceFor` in `lib/schemas/notifications.ts` words every row from those facts: FR-6.10's words for a pass, and the reopened copy by where the reader's own suggestion stands (waiting, draft, accepted, passed, stale, withdrawn). The list, the immediate email, the hourly digest and the weekly digest all read from it; the weekly digest's items say what each request asks for, and its row leads to Browse. Dates in the list are in the account's zone (item 1.18). Tests: `lib/schemas/notifications.test.ts` (the wording), `routers/notification.test.ts` (the FR-6.10 sentence with the chapter, a former member, the reopened standing, Browse, two pages by cursor with a stranger's cursor ignored, markRead on your own rows only), the template test for the line's sentence; flow 4 opens the row and finds it read, naming who sent it and the chapter (passes against a fresh build).)_
  - **Now:**
    - There is only `markAllRead`, and clicking a row doesn't mark it read.
    - The list stops at 50, while the unread count covers everything.
    - No row names who acted.
    - A pass reads "An author went a different way", not FR-6.10's "Maya went a different way on chapter 4. Your version is still on your profile."
    - The weekly digest row has no link (`server/notification-targets.ts`).
    - The "open again" copy speaks of "a suggestion of yours that was waiting", even to writers whose suggestion was accepted or passed.
  - **Do:**
    - `notification.markRead({ ids })`, for your own rows only. Clicking a row marks it read, then navigates.
    - "Show older", by cursor, with the page size as a constant.
    - `notification-targets.ts` also resolves the actor's display name ("a former member" once erased) and the chapter's position. It does so at read time, and only as far as the recipient may now read. Both the list and every email template use it.
    - Use FR-6.10's wording for a pass. Word the reopened copy for each kind of recipient.
    - The weekly digest row links to `/browse`.

- [x] **6.10 — Credits say where** · FR-9.2, FR-9.3 · P2 · S _(2026-10-18: `Place` gained the chapter's and the section's positions, and `placesInMainDrafts` resolves lineages across many stories in three queries, so a profile's page of credits costs the same whatever it spans (`mainDraftPlaces` is now the one-story case of it). The contributors page links each credit to "chapter N, section M". On the profile, every credit leads to where it reads: the passage for accepted prose, with its chapter and section; the suggestion's own page once the passage has left the draft; the request, at the idea, for an idea that helped; the story for a co-author. Both lists page past `PROFILE_LISTS` with "Show older" by cursor (`profile.credits`, `profile.passed`, which keeps FR-9.4's rule); the first page is server-rendered and the "Written but not used" count is the whole. Your own profile says it is how others see you and links to Settings. Tests: `profile-credits.test.ts` (the passage by chapter and section on both pages, the suggestion-page fallback, the idea's request, two pages of credits with a stray cursor ignored, two pages of passed work and nothing for a visitor until shown); flow 3 finds the Settings link on the helper's own profile, flow 4 finds the chapter-and-section link on the contributors page and the profile's credit leading to the passage (pass against a fresh build).)_
  - **Do:**
    - The contributors page shows each credit's chapter and section, linked; `credit.place` already exists.
    - On the profile, accepted work links to the passage, not to the story's front page.
    - Credit lists page past `PROFILE_LISTS`.
    - Your own profile links to Settings.

- [x] **6.11 — Copy link** · P3 · S _(2026-10-18: `components/copy-link.tsx` copies an address given relative to the site (the page's own when none is given) with the clipboard API, falls back to a selected off-screen field and the old copy command, and when both fail says the address is in the browser's bar; the button reads "Link copied" for a moment and a `role="status"` live region that is always present announces it. On the reader's menu as a ghost button (the story's address), on the request page's line (the request's), on the suggestion page's line (its own, permanent address) and under the handle on a profile (`/@username`). Test: `e2e/copy-link.spec.ts` grants the clipboard, copies from the reader, a profile, a request and a suggestion page as a guest, and reads the clipboard back (passes against a fresh build, with the accessibility scan).)_
  - **Do:** `components/copy-link.tsx` uses the clipboard API with a fallback and announces "Link copied" through `aria-live`. Put it on the reader, the request page, the suggestion page and profiles.

- [x] **6.12 — The request form helps** · FR-5.3, FR-5.4, FR-5.8 · P2 · S _(2026-10-18: the title, the tone notes and the character notes count characters against their limits (named to the field through `aria-describedby`); the ask and the story so far already counted words with their ranges; the rules say "N of 10, each under 200 characters" and the reading list "N of 20" and stops taking more at the cap (its boxes disable); every number comes from `REQUEST_EXTRAS`, `REQUEST_TITLE_MAX_CHARS` and `SUGGESTION_WORDS`, and the two hard-coded 200 and 10 are gone. `WORD_BOUNDS_SENTENCE` ("Between 100 and 2,000 words.") is the hint under the word bounds, the form's own refusal while a bound is outside the range or not whole (the button waits), and the schema's message instead of Zod's. Tests: `help.test.ts` (the refusal says the sentence); `request-edit.spec.ts` sees the title's count, the sentence for 50 with the button disabled, and the character notes' count (passes against a fresh build with flows 3 to 5).)_
  - **Now (found once):**
    - The form has no counters.
    - `open-request-form.tsx` hard-codes 200 and 10.
    - Typing 50 into the word bounds shows Zod's raw "Too small: expected number to be >=100".
  - **Do:**
    - Live counters: the title in characters; the ask and pre-context in words, with their ranges; the number and length of constraints.
    - Every limit from `REQUEST_EXTRAS`.
    - Plain messages for the bounds in `lib/schemas/help.ts` ("Between 100 and 2,000 words").
    - The reading-list cap enforced in the browser as well.

- [x] **6.13 — The calendar counts help given** · FR-9.3 · P2 · M · `migration` (data) · `decision` (D-6) _(2026-10-18: `recordActivity` is called from two places only, after their transactions: a suggestion sent and a top-level idea posted, each on a story the sender does not write (not a reply, not an author's own words); the saves, the request opened, the acceptance and the pass no longer count, and `recordActivityFor` is gone. The day is the sender's own: `timeZoneFromHeaders` reads item 1.18's `x-time-zone` header (the cookie on a page load, UTC otherwise) and `dayKeyInZone` names the date. `activityCalendar` ends the year on the reader's today in their zone. Migration `20261018050000_calendar_counts_help` (data only) empties `ActivityDay` and rebuilds it from sent suggestions and top-level ideas on other people's stories, as UTC days; decision 0049 records D-6 and that the rebuilt days stay UTC. The calendar is a client component now: the heading "Days {name} wrote something for someone" ("you" on your own), a sentence ("Helped on 23 days in the last year." or "No help sent in the last year."), month names over the grid, a legend that names the counts each shade covers (0, 1, 2 to 3, 4 to 6, 7 or more), and the square under the pointer or the focus written out in a live line under the grid, so a phone is not left with a `title`. Tests: `time-zone.test.ts` (the day in a zone; header, then cookie, then UTC), `activity.test.ts` (a late evening lands on the sender's date; the year ends on the reader's today in either zone), `idea.test.ts` (the helper's day marked, the author's not); flow 4 reads the heading and "Helped on 1 day in the last year." on the helper's profile (passes against a fresh build).)_
  - **Now:**
    - `recordActivity` runs on a person's own saves and request opening, not only on help given (see its call sites).
    - Days are UTC.
    - The tooltip is a `title` attribute only.
    - There are no month labels, and the legend has no numbers.
  - **Do:**
    - Record activity only when someone sends a suggestion, or posts a top-level idea, on a story they don't author.
    - Days in the person's own time zone, from 1.18's header.
    - A data migration rebuilds `ActivityDay` from sent suggestions and ideas. Past days stay UTC; say so in the decision record.
    - Show a sentence of summary ("Helped on 23 days in the last year"), month labels, and a legend with numbers.
    - The profile heading follows the prototype: "Days {name} wrote something for someone".

- [x] **6.14 — "Needs you" on the dashboard** · FR-11.1, prototype · P1 · S–M _(2026-10-18: `request.needsYou` lists, for the stories someone writes (`authoredStoryboardsWhere`, which `listMine` now shares), the suggestions waiting for a decision (sent, not hidden, on a request still open or answered), the one that has waited longest first, and the "help me think" requests that are answered with none of their ideas marked as the one that helped, each with its count of ideas; `NEEDS_YOU` bounds both. `needs-you-region.tsx` is the dashboard's first region, labelled "Needs you" with its count, hidden when there is nothing: each suggestion with who sent it, the story, the chapter, the length, the day and Compare; each request with "Read them"; and the invitations to co-author, which the old banner carried, with Answer. Tests: `needs-you.test.ts` (oldest first, a hidden suggestion and one on a closed request left out, the thinking request with one idea and the reply not counted, the co-author sees the same, the helper nothing); flow 4 opens the dashboard, finds the region and follows Compare to the comparison (passes against a fresh build with flow 12's invitation).)_
  - **Do:** a first region, for authors, hidden when empty. It lists:
    - suggestions waiting for their decision, oldest first, each with Compare
    - unblock requests that have ideas and none marked as helped
    - pending co-author invitations

- [x] **6.15 — A request closes by itself after 30 days** · FR-11.3 · P2 · M · `decision` (D-8) · `migration` _(2026-10-18: `REQUEST_OPEN_DAYS = 30`; `closesOn(openedAt)`; `ContributionRequest.openedAt` in `20261018051000_request_opened_at` (backfilled from `createdAt`), set again by `request.reopen` so a fresh thirty days start. The request page says "Closes on {date}" while it is open or answered, and the cards in browse and on the dashboard say it too, all in the reader's zone. `closeStaleRequests` runs inside the nightly `purge` job, before the purges: every request open or answered past its day closes through the same function the author's own close uses (so the people answering it are told as that close tells them), and the author is told once per request by `REQUEST_AUTO_CLOSED` (`20261018052000_request_auto_closed_notification`, hourly, worded by `sentenceFor`, leading to the request). A resolved request is left alone; browse keeps "Waiting longest". Decision 0050 amends principle 1.3.4 for this one case and says that requests already open longer than thirty days close on the first nightly run after deployment. Tests: `help.test.ts` (the date), `close-requests.test.ts` (31 days closes and tells the author once, 29 does not, resolved is left, a second run says nothing again), `integrity.test.ts` (opening again moves `openedAt`), `digests.test.ts` (seventeen types, each with its words); `request-edit.spec.ts` reads "Closes on" on the page (passes against a fresh build).)_
  - **Now:** the sort is labelled "Waiting longest" and lists the oldest first, with no horizon; no request ever closes by itself (principle 1.3.4).
  - **Do (D-8, the owner's answer):**
    - `REQUEST_OPEN_DAYS = 30` in constants. A request's page and its cards say "Closes on {date}" from the day it opens, in the reader's time zone (1.18).
    - A nightly job, beside the purges, closes every open or answered request opened more than 30 days ago, through the same function the author's own close uses, and tells the author once per request. Suggestions already sent are treated as the author's own close treats them today.
    - An author can open a closed request again, which starts a fresh 30 days; a resolved request is left alone.
    - Browse keeps "Waiting longest". Write a decision record amending principle 1.3.4 for this one case.
  - **Test:** a unit test for the date line, a job test (31 days old closes, 29 does not, resolved is left), and a router test for opening again.

- [x] **6.16 — The quiet-request email offers the fix** · FR-12.4 · P3 · S · needs 6.1 _(2026-10-18: `quietRequestMail` takes `editUrl` and says "Change the word range" with a link to the request's edit page (item 6.1), in text and in HTML, instead of "close it and ask again"; `runQuietNudge` passes `{request}/edit`. Test: `digests.test.ts` reads the link and the absence of the old advice.)_
  - **Do:** the seven-day nudge links "Change the word range" to the request's edit page.

- [x] **6.17 — What share of a story is the author's own** · FR-9.2, decision 0041 · P3 · S _(2026-10-18: `ownShareOf` in `lib/own-share.ts` counts, over the live sections of the main draft, the words whose current revision an owner or a co-author wrote (decision 0041) against all of them; an accepted suggestion's writer's words, and an erased writer's, are somebody else's; null with no words. `mainDraftOwnShares` resolves it for many stories in two queries. The contributors page says "{n}% of the main draft is the author's own words" after "N writers have contributed", the reader's header line says it under the byline on the main draft, and the profile's authored list says "{n}% the author's own words" per story; a story with no contributor beyond its co-authors says nothing. Tests: `own-share.test.ts` (owner and co-author count as the author's, rounding, an erased writer does not, nothing with no words); flow 4 reads the sentence on the contributors page after the accept (passes against a fresh build).)_
  - **Why:** the owner's suggestion on D-13 (2026-10-18): owning the story is the credit, and a visitor could still see how much of it the author wrote themselves.
  - **Do:** on the contributors page, and in the reader's header line beside the contributors strip (7.3): "{n}% of the main draft is the author's own words", from the live sections' current revisions by author (an owner's or co-author's revision counts as the author's). The profile's authored list shows the same figure per story. A story with no contributors says nothing.
  - **Test:** a unit test for the figure over a fixture, and a check in flow 4 after the accept.

---

## 7. The reader the prototype drew

- [ ] **7.1 — Request cards in the margin** · FR-11.5, prototype · P1 · M
  - **Now (found once):**
    - Cards sit inline under each section, inside the text column.
    - The "leader rule" is a 40 px stub.
    - The highlight that a click starts never clears.
    - The reader page still carries a phase-1 comment saying the margin will arrive later.
  - **Do:**
    - From `lg` up, three columns as in the prototype: contents (216 px), the page, and the margin (320 px).
    - The margin lists the chapter's open requests in section order. Each card shows:
      - the kind: "Wants it rewritten", "Wants someone to write it" or "Wants ideas"
      - the title, and two lines of the ask
      - the word range and the number of answers
    - The leader rule sits on the card's left edge. It thickens and turns blue pencil on hover and focus, while its section is highlighted.
    - A click scrolls the section into view, focuses it and highlights it. The highlight clears after a couple of seconds, or at the next interaction.
    - Below `lg`, the inline cards stay.
    - Remove the stale comment.
  - **Test:** a flow checks that hovering or focusing a card lights its section, and that a click scrolls to it and the highlight then clears.

- [ ] **7.2 — Requests in other chapters are visible** · FR-11.5 · P1 · S
  - **Do:**
    - The contents rail, and 4.3's chapter list, mark chapters that have open requests: an ochre dot, plus text for screen readers.
    - The margin ends with "Elsewhere in this story", linking to section addresses.
    - Browse's "Read it" for a request opens that request's section address.

- [ ] **7.3 — The contributors strip** · FR-9.2 · P1 · S · needs 3.13
  - **Do:**
    - In the margin, under the cards; below `lg`, after the manuscript.
    - Up to five contributors, each with initials, a name, and either their latest credit ("chapter three, accepted 4 Sep") or a count.
    - Inherited credits are marked "from the original".
    - Ends with an "All contributors" link.

- [ ] **7.4 — The first chapter arrives with the page** · NFR-1 · P1 · M
  - **Now:** the reader fetches its prose in the browser (`reader-shell.tsx`, `useQuery`), so the server's HTML says "Loading…". First paint is slower, and search engines and link previews get no text. `reader-performance.spec.ts`'s "first response carries one chapter" check passes with no prose in the response.
  - **Do:**
    - In `s/[slug]/page.tsx` and `c/[chapter]/page.tsx`, await the first chapter's `section.listForChapter`, and the request list, on the server. Use `getQueryClient().prefetchQuery(trpc….queryOptions(input))` with exactly the inputs the client uses, and wrap the reader in `<HydrateClient>`. Both helpers are in `trpc/server.tsx`.
    - Fix the performance test so it fetches the raw HTML and looks for the first paragraph's text.
    - Measure first contentful paint under Chrome's Fast 3G preset against the local production build, and write the number in the tracker.
    - Assert the 1.2 s budget only if the build meets it. Never weaken the measurement to make it pass.

- [ ] **7.5 — Reading settings apply at once, for everyone, everywhere** · NFR-5 · P2 · S–M
  - **Now (found once):** saved sizes are applied in an effect after the page loads, so the text jumps. Guests get no controls, and the editor, composer and comparison ignore the settings.
  - **Do:**
    - Read the person's preferences on the server (a `reading` cookie for guests) and set them as CSS variables on the page.
    - `.manuscript` uses those variables everywhere.
    - Guests get the controls, which store the cookie.

- [ ] **7.6 — "Last written"** · prototype, FR-11.1 · P2 · S · `migration`
  - **Now:** the dashboard sorts by `Storyboard.updatedAt`, which no section save changes, and nothing shows when a story was last written.
  - **Do:**
    - Add `Storyboard.lastWrittenAt`, backfilled from each story's latest revision.
    - A helper sets it in every transaction that writes a revision: commit, restore, split, join, accept, import, spin-off.
    - The dashboard's "You're writing" sorts by it.
    - Cards and the reader's header say "last written on 9 September", and finished stories are marked.

- [ ] **7.7 — "Example" wherever a seeded story appears** · FR-15.3 · P1 · S
  - **Now (found once):** the label is missing on the request page (where browse sends helpers), the suggestion and comparison pages, the composer, contributors, lineage, dashboard news and notifications. The marketing page calls the seeded works "Two real stories".
  - **Do:** one shared label component on all of those. On the marketing page: "Two example stories".
  - **Test:** a flow sees "Example" on a seeded request page.

- [ ] **7.8 — Report a story from the reader** · FR-13.5, FR-10.6 · P2 · S
  - **Do:** "Report this story" in the reader's menu, for signed-in people who aren't its authors, reusing the already-reported state. Guests see "Sign in to report".

- [ ] **7.9 — Printing a story** · P3 · S
  - **Do:** `@media print` hides the header, the rail, the margin and the buttons, sets the manuscript full width, and starts each chapter heading on a new page.

- [ ] **7.10 — A promotion is recorded** · FR-10.2 · P2 · S–M · `migration`
  - **Now:** promotion writes only a log line. The old main draft keeps the name "Main draft", so the reader says "You are reading Main draft, an alternate version".
  - **Do:**
    - Add `VersionEvent { id, storyboardId, kind, versionId, previousVersionId, actorId, createdAt }`, written in the promotion's transaction.
    - If the demoted version still has the default name, rename it "Main draft until {date}".
    - The versions page shows the history: "18 Oct — 'Ship never lands' became the main draft, by Maya. The previous one is kept as 'Main draft until 18 Oct'."
    - The reader always calls the main draft "the main draft".

- [ ] **7.11 — The full lineage** · FR-10.5 · P2 · S
  - **Now:** the banner names only the immediate original. `/lineage` shows three ancestors, then tells the reader to open the one above, and the walk stops at 20 (`spinoff.ts`).
  - **Do:**
    - The banner shows the chain truncated to three, with "see full lineage".
    - `/lineage` shows the whole chain back to the first story, up to a cap set as a constant and stated honestly when it is reached.
    - Private ancestors are named as such, as the existing rule does.
    - Move both numbers into `constants.ts`.

---

## 7b. Publishing

Decision 0044, at the owner's request on 2026-10-18: a published, read-only edition of a story, like a release of a project; publishing again replaces it; a published spin-off tells and credits its original.

- [ ] **7b.1 — Publish an edition** · decision 0044 · P2 · M · `migration`
  - **Do:**
    - `Version.frozenAt`; `Publication { id, storyboardId, number, versionId, publishedById, publishedAt, note }`; `Storyboard.currentPublicationId`.
    - `publication.publish({ storyboardId, note? })`, owner only (`storyboard:publish`, a new matrix cell): copies the main draft's tree into a new frozen version (shared revisions, decision 0014), writes the publication with the next number, and sets the current one. In one transaction, with `BULK_WRITE_TRANSACTION`'s limits.
    - `loadVersion` refuses every write action on a frozen version: "This is a published edition. Change the working draft and publish again."
    - A structured log line, and a stored event once 10.2 lands.
  - **Test:** a matrix cell test, an integrity test (publish twice, numbers 1 and 2, the first still readable; a write into the edition refused), and a flow step.

- [ ] **7b.2 — The edition pages** · decision 0044, FR-14.1 · P2 · M
  - **Do:** `/s/[slug]/published` (the current edition) and `/s/[slug]/published/[number]`, rendered by the finished-story reading page's component: no margin, no request cards, contributors from the foot, "Edition 3, published 18 October, by {name}" at the top, and "Read the working draft" for signed-in people. The reader at `/s/[slug]` shows the edition line with its link when one exists; the Versions page lists the editions; a private story's editions answer 404 like the story.
  - **Test:** flow: publish, open the edition as a guest, change the working draft, see the edition unchanged, republish, see it change.

- [ ] **7b.3 — Cards, profiles and exports know the edition** · FR-11.4, FR-14.2 · P3 · S
  - **Do:** a "Published" mark on browse cards and the profile's authored list, linking to the edition; the export page offers "the published edition" (default when one exists) or "the working draft"; file names carry `-edition-{n}` (8.8).

- [ ] **7b.4 — A published spin-off tells its original** · FR-10.3, FR-10.6 · P2 · S · `migration`
  - **Do:** a new notification type, `SPIN_OFF_PUBLISHED`, hourly, to the original's authors, linking to the spin-off's edition; the edition page and its exports name the original as exports already do. Follow the "new notification type" rule.
  - **Test:** router test; the type count test moves on by one.

- [ ] **7b.5 — The terms say what publishing means** · FR-14.4, D-2 · P2 · S · with 2.2
  - **Do:** the terms' paragraph on publishing: an author's own work is theirs to publish anywhere; a spin-off's needs the permission of the authors of the text it carries; publishing on Draftboard tells the original. Written against decision 0044 and finished when 7b.1 lands.

---

## 8. The writing tool

- [ ] **8.1 — Back to where you were** · P1 · S
  - **Now:** "Back to the story", Split and History's back link all go to `/s/{slug}`, which opens chapter 1.
  - **Do:**
    - They go to the section's own address, worked out from positions with `server/places.ts`, keeping `?version=`.
    - The editor shows "Previous section" and "Next section", across chapters, and saves before leaving (8.5).

- [ ] **8.2 — "Create and start writing" opens the editor** · FR-2.2 · P2 · S
  - **Do:** after creating a story, go to the first section's editor.

- [ ] **8.3 — Move a section to another chapter, or add one in the middle** · FR-2.3 · P2 · M
  - **Do:**
    - `section.move({ sectionId, toChapterId, position })`, within one version and one transaction. It renumbers both chapters, leaves the lineage and requests unchanged, and needs `canStructure`.
    - The Contents page gives each section "Move to…" (a chapter and a position), which is also the keyboard route.
    - "Add a section after this one", using `section.create`'s existing `afterSectionId`.

- [ ] **8.4 — Change a story's type within its family** · FR-2.1 · P2 · S · (D-16)
  - **Now:** `updateStoryboardSchema` has no type. Import preselects Novel for `.fdx` and `.fountain` files, and a prose type flattens script elements into paragraphs.
  - **Do:**
    - The type can change within the prose types, or within the script types. A change across is refused, with the reason.
    - Import preselects Screenplay for `.fdx` and `.fountain` files.

- [ ] **8.5 — Saving survives a bad connection** · P1 · M
  - **Now (found once):**
    - A failed save shows "Not saved" with the browser's raw message ("Failed to fetch").
    - Nothing retries until the next keystroke, and nothing listens for the connection coming back.
    - The editor's in-app links skip the leave warning, and leaving clears a pending draft save without running it.
  - **Do:**
    - Plain status copy: "Couldn't save. Your words are kept on this device. Trying again…"
    - Retries with backoff, and again on the `online` event.
    - Unsaved text is mirrored to localStorage per section, cleared on a confirmed save, and offered back on reopening when it is newer than the saved draft.
    - In-app links inside the editor wait for the save, or the existing save beacon runs on unmount.
    - The suggestion composer gets the same treatment.
  - **Test:** a flow with `context.setOffline(true)`:
    - type, see the message, go back online, and see "Saved"
    - reload with text typed while offline, and see it offered back

- [ ] **8.6 — Two tabs on one section** · P3 · S
  - **Do:**
    - A BroadcastChannel per section warns both tabs: "This section is open in another tab."
    - After a co-author removes or joins the section, "Reload" goes to the story's contents, not to a position address that now points elsewhere.

- [ ] **8.7 — Renaming a story moves its address** · P2 · S–M
  - **Now:** the slug keeps the old title (`storyboard.update`).
  - **Do:**
    - A new title regenerates the slug as `${slugify(title)}-${publicId}`.
    - Looking up a slug tries the exact slug first, then the 10-character `publicId` suffix.
    - Pages under `/s/[slug]` redirect permanently to the current slug, keeping the rest of the path and the query.
  - **Test:** a router test, and a flow that renames a story and finds its old address redirecting.

- [ ] **8.8 — Export what you need, with a good file name** · FR-14.2 · P2 · S–M
  - **Now:**
    - There is no single-chapter export.
    - There is no choice of version, although the route accepts `?version=`.
    - The file name is the title alone, so a Hindi or Japanese title becomes `manuscript.docx` (`packages/export`, front matter).
  - **Do:**
    - The export page offers a version and a scope: the whole story, or one chapter.
    - File names follow `{slug or "story"}-{yyyy-mm-dd}[-chapter-n][-version].ext`, with an RFC 5987 `filename*` that carries the real title.
    - The contributors page stays embedded (FR-14.3).

- [ ] **8.9 — Import: start again cleanly, cancel an upload** · FR-3.2 · P2 · S
  - **Do:** "Start again" replaces the address without `?job=`, and a Cancel button aborts an upload in progress.

- [ ] **8.10 — Story settings for co-authors, and "saved" means saved** · P2 · S
  - **Now (found once):**
    - Co-authors may edit a story's details on the server (`storyboard:edit`), but the settings page is open to the owner only.
    - "Save details" confirms nothing.
    - "Mark it finished" sits under "Take it out".
    - The create form says genres are "(up to 3)", needs at least one, and just stays disabled without one.
  - **Do:**
    - Co-authors see the details; the owner-only parts say who can change them.
    - A "Saved" status after saving.
    - Finishing moves into Settings.
    - The genre hint reads "Choose 1 to 3", with a message if the form is sent without one.

- [ ] **8.11 — Shortcuts and handles that say what they do** · NFR-4 · P3 · S
  - **Do:**
    - Show ⌘ on macOS and Ctrl elsewhere, in tooltips and in a "Keyboard shortcuts" list in the editor.
    - Name every drag handle: "Move section 'Vessel'".

- [ ] **8.12 — A proof anyone can check** · FR-13.6 · P2 · S–M · `decision` (D-11)
  - **Now:**
    - The PDF prints a hash and a time, and nothing verifies either.
    - The address it prints is the section's history page, which is a 404 for anyone else on a private story.
    - A contributor can't reach their own proof from any screen.
  - **Do:**
    - A public `/proof/[revisionId]` page shows the record: the SHA-256, the timestamp, the word count and the writer's public name, plus "versions can't be changed once written" (NFR-3).
    - The story's title shows only to someone who can read the story; anyone else sees "a private story".
    - The PDF prints that page's address.
    - "Proof that you wrote this" appears on the writer's accepted suggestion page and on their profile's credits.
    - The page says in a sentence what the record is and is not (D-11): it shows who wrote these words on Draftboard and when; it cannot show that they were original to that person.
    - Write a decision record: the proof is checked against the record, not signed.

- [ ] **8.13 — The export footer names the people** · FR-13.6, FR-14.3 · P2 · S
  - **Do:** every format with a footer reads "Written by {author} with {n} contributors · {address}". The full list stays in the front matter.

- [ ] **8.14 — Optional reasons on a restore** · FR-8.6 · P3 · S · `migration`
  - **Do:**
    - Add `Revision.restoreReason`, nullable and set when the revision is inserted; the immutability trigger allows inserts.
    - 5.3's dialog offers the four chips.
    - History shows the reason.

---

## 9. Discovery, admin and seeds

- [ ] **9.1 — Browse pages through everything** · FR-11.3 · P2 · S–M
  - **Do:**
    - "Show more", by cursor, for requests and for stories.
    - Honest counts: "Showing 24 of 57".
    - Each card says when its request was opened.

- [ ] **9.2 — Dashboard regions lead on** · P3 · S
  - **Do:** the genre region's "See all" goes to `/browse` with the genres filtered; the news region's goes to `/suggestions`.

- [ ] **9.3 — Moderation by keyboard** · FR-13.7 · P2 · S
  - **Do:**
    - On the report queue: j and k move, u upholds, h upholds and hides (2.7), d dismisses, o opens the target. The keys work only when focus is not in a field.
    - A visible legend of the keys, and `aria-keyshortcuts` on the buttons.
    - Paging past 50.
    - "Admin" in the header for admins (4.1).

- [ ] **9.4 — Feature flags that do something** · FR-15.5 · P2 · S–M · (D-18)
  - **Now:** flags can be created and switched on and off, and nothing reads them.
  - **Do:**
    - Known kill switches, listed in constants and seeded idempotently in the off position: `pause-sign-ups`, `pause-imports` and `pause-spin-offs` by default.
    - `lib/flags.ts` exports `isOn(key)`, with a short per-instance cache.
    - Sign-up and a first Google sign-in, `import.createUpload` and `spinOff.create` each check their switch, and refuse in plain words when it is on.
    - The admin screen switches known flags only.

- [ ] **9.5 — The seeds show every kind of stuck point** · FR-15.4, FR-1.1 · P1 · M · `owner` (D-14)
  - **Now:** counted in `packages/db/prisma/seed/storyboards/library.ts`:
    - 44 open requests: 1 rewrite, 16 continue, 27 unblock
    - 16 accepted rewrites
    - none on The Yellow Wallpaper (`example-storyboard.ts`), the first story the marketing page's "Read it" opens, so its sixty-second promise fails
  - **Do:**
    - At least 10 open rewrite requests, across genres.
    - One open request of each kind on The Yellow Wallpaper.
    - Keep FR-15.2's public-domain rule, and the rules of FR-5.4 and FR-5.7.
    - Seeded help, too (D-14): on a handful of seeded requests, a few suggestions and ideas from seeded accounts, so a newcomer sees how helping works before anyone else is there. They go when the seeded stories go (the seed manager, `seeds.manage`).
    - Update `SEED_TARGETS` and the seed tests. `pnpm check-excerpts` must stay green.
    - The owner reads the new stuck points before production is seeded.

- [ ] **9.6 — Links that preview well** · P1 · S–M
  - **Now:** there is no `metadataBase`, no Open Graph, no Twitter card and no canonical address. Sub-page titles don't name the story ("Comparison", "Contributors").
  - **Do:**
    - A root `metadataBase`, and default Open Graph and Twitter metadata.
    - For each page type:
      - a story: its title, and its logline or the first 160 characters of its opening, for public stories only
      - a request: "{title} — a stuck point in {story}", with its ask
      - a suggestion, and a contributors page, named for their story
    - Canonical addresses on stories and chapters.
    - Private stories and alternate versions are `noindex`.
    - A default `opengraph-image`, drawn with `next/og` in the paper and pencil colours.

- [ ] **9.7 — Icons and a manifest** · P1 · S
  - **Now:** neither app has an icon, an apple-touch-icon or a manifest, so every tab shows the browser's default icon.
  - **Do:** in both apps:
    - `icon.svg`, a simple mark on paper, drawn as paths
    - an `apple-icon` made with `next/og`
    - `manifest.ts`, with the name, short name and colours

- [ ] **9.8 — Crawlers see the right pages** · P3 · S
  - **Do:** history, comparison, versions, export and lineage pages are `noindex`. Public profiles with public work go in the sitemap.

---

## 10. Operations and housekeeping

- [ ] **10.1 — Server errors are kept, and someone hears about them** · NFR-7 · P1 · M · `migration` · `decision` (D-10)
  - **Now:** logs go only to stdout (`lib/logger.ts`), and the host keeps them briefly. There is no error tracking and no alert.
  - **Do:**
    - A `ServerError` table, written from `instrumentation.ts`'s `onRequestError` and from the tRPC route's error handler, for internal errors only.
    - Each row keeps when and where, a fingerprint, the message truncated, and the top stack frames. No request bodies and no user content.
    - Rows are pruned after a number of days set as a constant.
    - An "Errors" page in admin, grouped by fingerprint.
    - The hourly job emails admins when a new fingerprint appears, at most once an hour.
    - If writing the row fails, log the error only.

- [ ] **10.2 — Socially significant events are kept** · NFR-7 · P2 · S–M · `migration`
  - **Do:**
    - An `AuditEvent` table: when, the event, the actor, the story, the target and a small JSON.
    - It is written after commit, beside the existing log line, for: accept, pass, restore, spin-off, report, suspend, lift, hide, show, promotion, and deletion requested, cancelled or done.
    - Retention is a constant, pruned daily.
    - An admin view, filterable by story or by person.
    - The privacy page names it.

- [ ] **10.3 — Scheduled jobs and backups don't stop on a quiet repository** · NFR-8 · P1 · S
  - **Now:** GitHub stops scheduled workflows after 60 days without repository activity (`cron.yml` says so in a comment). Nothing prevents it, and `backup.yml` would stop the same way.
  - **Do:**
    - A monthly run re-enables the scheduled workflows through the API: `PUT /repos/{owner}/{repo}/actions/workflows/{file}/enable`, with `permissions: actions: write`. A pinned keepalive action that does the same also works.
    - Confirm in GitHub's documentation that this resets the timer before relying on it.
    - Note in `05-deployment.md` whom GitHub emails when a scheduled run fails.

- [ ] **10.4 — The vocabulary linter reads server copy** · `01-srs.md` §2 · P2 · S–M
  - **Now:** it scans only `app/`, `components/`, `messages/` and `packages/ui` (`DEFAULT_ROOTS` in `scripts/check-vocabulary.ts`). Server error messages, emails, exports and import's reasons go unchecked; 1.13 slipped through that way. The marketing page keeps "A storyboard has chapters and sections" behind a `vocabulary-ok` escape.
  - **Do:**
    - A second mode for server copy, which checks:
      - every string in the mail templates, the notification copy (`lib/schemas/notifications.ts`), the authz labels, export's front matter and footers, and import's reason copy
      - the `message` of every `new TRPCError({ … })` in `apps/app/src/server`
    - Identifier-like strings (no spaces, containing `:` or `.`) are not copy.
    - Tests in `check-vocabulary.test.ts`.
    - Fix whatever the new mode finds, the marketing line included.

- [ ] **10.5 — Numbers come from `constants.ts`** · P2 · S
  - **Now (found once):** numbers are copied into:
    - `auth/config.ts`: the session `maxAge`
    - `verify/set-password-form.tsx` and `reset-password-form.tsx`: 10
    - `onboarding/username/choose-username-form.tsx`: 3, and the copy "3 to 30"
    - `routers/settings.ts` and `settings/settings-form.tsx`: 80 and 280
    - `verify/page.tsx` and `templates/verify-email.ts`: "24 hours"
    - `new/create-storyboard-form.tsx`, `s/[slug]/settings/settings-form.tsx` and `lib/schemas/storyboard.ts`
    - `routers/version.ts`, `routers/import.ts`, `import-flow.tsx`, `contents-editor.tsx` and `open-request-form.tsx`
    - `spinoff.ts`: 3 and 20
  - **Do:**
    - Import the constants that already exist: `TITLE_MAX_CHARS`, `IMPORT_LIMITS.bytes`, `PASSWORD_CHARS`, `USERNAME_CHARS`, `VERIFICATION_TOKEN_TTL_HOURS`, `REQUEST_EXTRAS` and others.
    - Add the missing ones: `SESSION`, `PROFILE_CHARS`, `LINEAGE`, `VERSION_NAME_MAX_CHARS`.
    - Copy that states a number derives it from the constant.

- [ ] **10.6 — What the phase 12 audit left for "the next migration"** · P2 · S · `migration`
  - **Now:** phase 12 recorded two items needing a schema change:
    - **M15:** the notification queue's query (`emailedAt: null`, ordered by `createdAt`, in `server/mail/digests.ts`) has no index.
    - **H6b:** the weekly digest keeps no record of whom it was sent to, so a run repeated by hand sends it twice.
  - **Do:**
    - A partial index on `Notification ("createdAt") WHERE "emailedAt" IS NULL`, in raw SQL with a comment naming FR-12.3.
    - Add `User.weeklyDigestSentAt`, set for each recipient. The weekly run skips anyone sent one within the last six days.
  - **Test:** a digest test that repeats the run.

- [ ] **10.7 — The documents say what's true** · P2 · S
  - **Now:**
    - `tasks.md` says phase 9 and the rename are uncommitted, and was last updated 2026-10-15.
    - `04-phase-plan.md`'s hosting checklist shows `[ ]` against services that are live.
    - `05-deployment.md` still shows "Storyboard <…>" as the sender.
    - `SECURITY.md` has a TODO address.
  - **Do:** bring all four up to date, and the README if its feature list has changed.

---

## Deliberately not in this plan

So nobody adds them on the way past:

- **For now:** two-factor sign-in; a welcome email; analytics; a status page or a changelog.
- **Already decided:** dark mode (the "Paper, and no dark mode" decision).
- **The seeds stay files:** seeded content is edited in its files (FR-15.6), not from the admin screen.
- **Deferred in the spec** (`01-srs.md` §8): real-time collaboration, full-text search, mobile apps, live tracking of spin-offs.
- **Never:** private messages of any kind (decision 0020), and AI anything (`01-srs.md` §1.3).

---

## 11. The final pass

When every item above is `[x]`, `[-]` or `[!]`:

1. **Run CI's exact steps** on a fresh local database, and write the test and flow counts beside 0.1's baseline.
2. **Walk this checklist again**, from 1.1. For each item, open the code, run its test, and do its "Done when" in a local production build. Then mark it:
   - `[x]` done
   - `[~]` partly done, saying what is missing
   - `[ ]` not done

   No tick stands unless it has been looked at again.

3. **Score the plan.**
   - Done counts 1, partly done 0.5 and not done 0.
   - Leave out items dropped by an owner decision.
   - Report each milestone, the whole plan, and P1 on its own.
4. **Re-count the spec** the same way as the 2026-10-17 review. Walk FR-1.1 to FR-15.6 (100 features) and NFR-1 to NFR-9, mark each done, partly done or not, and fill in the table below.
5. **Write the results** here and in `04-phase-plan.md`'s Current position, and hand the owner:
   - every migration production needs, in order
   - any new environment variable names
   - the seeds to run
   - the owner list below

| Measure                           | Baseline, 2026-10-17          | After phase 14 |
| --------------------------------- | ----------------------------- | -------------- |
| Features (100)                    | ~80 done · ~19 partly · 1 not |                |
| Non-functional requirements (9)   | 5 met · 4 partly              |                |
| This plan, all items              | —                             |                |
| This plan, P1 only                | —                             |                |
| Ready for strangers (a judgement) | 70–75%                        |                |

## The owner's list

Not for the developer. Production, accounts and approvals:

**Before and after pushing**

- Apply this phase's migrations to production with `pnpm db:deploy` before pushing the code that needs them. Otherwise the build refuses to deploy, and production keeps serving the previous build.
- Read the new seeded stuck points (9.5), then seed production once.
- Run 1.1's read-only query against production, to find any story whose main draft was emptied. It reads and changes nothing; a story it names is repaired by promoting its previous main draft back from the Versions page. On the local database it finds none.

  ```sql
  SELECT s."slug", v."id" AS "versionId"
  FROM "Version" AS v
  JOIN "Storyboard" AS s ON s."id" = v."storyboardId"
  WHERE v."isMain" = true
    AND s."deletedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "Chapter" AS c WHERE c."versionId" = v."id" AND c."deletedAt" IS NULL
    );
  ```

**Approvals**

- Read the privacy policy and the terms. A legal review before launch is recommended.

**Accounts and settings**

- In the Google Cloud console, put the privacy and terms addresses on the OAuth consent screen.
- A domain, Resend, and SPF/DKIM/DMARC records: mail is landing in spam.
- Add `SUPPORT_EMAIL` to `.env` and to Vercel, if the contact address shouldn't be the sender's.

**Carried over from earlier phases**

- The screen-reader pass (phase 12).
- After 2026-10-20, once Singapore has had a clean week: delete the Washington database.
- The Dependabot pull requests that are waiting.
- Decide OD-7 (age; the privacy policy's line on children follows it) and OD-9.

## Change log

- 2026-10-18 — Created from the review of 2026-10-17: four reads of the code against the SRS, the architecture and the prototype, plus a list of what a finished product needs that the SRS never listed. No code changed.
- 2026-10-18 — Milestone 1 done (19 of 19), with the baseline (0.1) and the tracker (0.3). The decisions table was put to the owner (0.2); three items used their defaults meanwhile and say so. Six migrations and one optional variable await production. Also found on the way: the editor's save callbacks were remade on every render, so a re-render cleared the pending draft save or the five-minute revision (fixed in 1.4), and the shared reader in the integrity suite is near FR-13.3's ten sends a day, so new tests that send use their own account.
- 2026-10-18 — The owner answered D-5 to D-18. Items 2.9, 3.3, 3.9, 3.13, 6.7, 6.15, 8.12 and 9.5 were rewritten for the answers: a request closes by itself after 30 days (6.15), the password rule is a composition rule with no block list (3.9), profile pictures are uploaded and kept small (3.13), and a session ends after 30 days (3.3). Milestone 2b begun.
- 2026-10-18 — Milestone 2 done (9 of 9, 2.8 inside 2b.5): a contact page, one-click unsubscribe with `List-Unsubscribe`, hiding what moderation upholds (decision 0045), blocking a person (decision 0046), the privacy policy and the terms (decision 0047 for what a helper grants), agreeing at sign-up with the rules read on the last onboarding step, and a footer on every page. Three more migrations await production. D-3's identity wording stays the one open question.
- 2026-10-18 — Milestones 4 (10 of 10) and 5 (8 of 8) done: one site header everywhere with a phone menu, the reader folded for phones with its chapters behind a button, the comparison stacked, the composer's constraints above the editor on phones, a pending bar instead of loading skeletons (which turned 404s into 200s), error pages, one skip link and one `main` on every page, a phone project in the browser tests, guests always able to get back to reading; and a confirmation dialog in front of every loss — closing, going private, passing, withdrawing, restoring, joining, removing — with the server's numbers, plus bringing removed chapters and sections back and an address for the history of what was removed or joined away. Items 6.1 to 6.7 followed the same day: requests that can be changed, character notes, the ask and the allowance in the composer, drafts that are findable and removable, drafts that follow the text they were started against, and sent suggestions that can be changed until an author opens them (D-12).
- 2026-10-18 — Milestone 3 done (16 of 16): a password change and an address change from settings, sign out everywhere with sessions that end after 30 days (D-15), a sign-in form that keeps the address and names the dead ends, `next` carried from "Sign in to help" through sign-up and onboarding to the request, a way out of onboarding, a username step that says why, display names that cannot pose as somebody else, the composition password rule (D-17), "Use a different address", signed-in people sent past the doors, dead links and abandoned sign-ups pruned, profile pictures kept small (D-5, decision 0048), one zip of your own data, a default visibility for new stories, and sign-in methods with a Google switch that means something. Three more migrations (nineteen in all) await production.
- 2026-10-18 — Milestone 2b done (7 of 7): roles with one admin set by `pnpm admin:grant`, sub-admins with grants, the overview, People (find, suspend with a note, ban, delete), Names, and the panel's frame with an "Admin" link in the header. Five migrations and one command await production. Found on the way and fixed: the ten-report suspension would have locked the administrator out; a sub-admin granted only `accounts.delete` could not reach the People screen; the purge left an administrator's note and a sub-admin's grants behind; and 1.6's `RetiredUsername` model sat between `Version`'s comment and `Version` in the schema. 666 tests in 61 files pass across the workspaces, and flow 8 passes against a fresh build.
- 2026-10-18 — Milestone 6 done (17 of 17), items 6.8 to 6.17 on the day: ideas that can be changed and removed; notifications that page by cursor, mark themselves read when opened, and say who did what (FR-6.10's words for a pass, the reopened copy by where your suggestion stands), with the emails reading from the same sentences; credits that lead to the passage, by chapter and section, with both profile lists paging; Copy link on the reader, requests, suggestions and profiles; a request form that counts and says its ranges in words; a calendar that counts help given, in the sender's own day, rebuilt from the records (decision 0049); "Needs you" first on the dashboard; a request that closes by itself after thirty days and says so from the day it opens (decision 0050, amending principle 1.3.4); the quiet-request nudge linking to the edit page; and what share of a story is the author's own, on the contributors page, the reader and the profile. Three more migrations (twenty-five in all) await production, one of them data only. Found on the way and fixed: `mainDraftPlaces` was three queries a story, so a profile's credits now resolve across stories at once; the calendar's `title` tooltip was unreachable on a phone; and the notification list's dates were in the browser's zone while every other date followed item 1.18. 601 tests in 67 files pass in the application, and all 56 browser flows on both projects pass against a fresh build (the closing run).
