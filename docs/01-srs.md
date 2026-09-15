# Storyboard — software requirements specification

Version 0.1 · owner: Vignesh · status: draft for build

---

## 1. Overview

### 1.1 The problem

A writer gets stuck on a specific passage — chapter four won't come, a scene falls flat, the plot has a hole they can't see around. Their options today are a beta reader who takes three weeks, a Discord thread that scrolls away, or an AI that produces text in nobody's voice. None of them leave a trace of who helped.

### 1.2 The product

Storyboard makes the stuck passage a first-class object. An author marks a section of their manuscript as open, says what's wrong with it, and supplies enough context to work from. Other writers submit replacement prose. The author accepts one, and it lands in the main draft with the contributor credited permanently. Anyone who wanted a different answer spins the story off and writes their own version alongside.

### 1.3 Product principles

These are constraints, not aspirations. Violating one is a bug.

1. **No AI anywhere in the writing path.** No generated prose, no summaries, no chapter detection, no moderation scoring. The value of the product is that a human helped. An AI feature would dissolve it. (Revisit only after v1 is live and only for non-prose surfaces.)
2. **The interface never speaks git.** Writers see drafts, versions, suggestions, and spin-offs. See §2.
3. **Credit is permanent and visible.** Every accepted contribution creates a durable, addressable record. Removing contributed text does not remove the record of the contribution.
4. **The author is never cornered.** Rejecting everything, accepting nothing, or walking away for a month are all supported states with no penalty.
5. **Scarcity over volume.** A contributor gets three open suggestions per storyboard. The product optimises for considered help, not throughput.
6. **Honest about risk.** Posting an unfinished manuscript in public carries copying risk. The product says so plainly rather than implying protection it cannot deliver. See FR-13.6.

### 1.4 Non-goals for v1

Real-time collaborative editing. Licence verification. Monetisation. Mobile apps. Publishing to third-party stores. Translation workflows. Anything using a language model.

### 1.5 Two open-source meanings

The codebase is open source (contributors welcome, transparency for writers who are being asked to trust it with unpublished work). The writing is open in a separate sense — anyone may read and offer help on a public storyboard. These are independent; do not conflate them in copy.

---

## 2. Vocabulary

This table is normative. `scripts/check-vocabulary.ts` fails CI if a banned term appears in any file under `app/`, `components/`, or `messages/`.

### 2.1 Objects

| Internal / schema            | UI string                                          | Never say           |
| ---------------------------- | -------------------------------------------------- | ------------------- |
| `Storyboard`                 | storyboard, or story / script / manuscript by type | repository, project |
| `Version` (`is_main = true`) | the main draft                                     | main branch, master |
| `Version` (author-owned)     | alternate version                                  | branch              |
| `Storyboard.forked_from_id`  | spin-off                                           | fork                |
| `Chapter`                    | chapter, act, part                                 | directory, file     |
| `Section`                    | section                                            | file, node          |
| `Revision`                   | version 4, or saved on 12 Sep                      | commit, SHA         |
| `ContributionRequest`        | a spot I'm stuck on / open for help                | issue, ticket       |
| `Suggestion`                 | suggestion                                         | pull request, patch |
| `Idea`                       | idea                                               | comment             |
| `Credit`                     | contribution                                       | attribution record  |
| diff view                    | comparison, what changed                           | diff                |
| conflict                     | overlapping edits                                  | merge conflict      |

### 2.2 Actions

| Internal          | UI string                  | Never say              |
| ----------------- | -------------------------- | ---------------------- |
| save revision     | (silent autosave)          | commit, push           |
| submit suggestion | send suggestion            | open a PR              |
| accept            | accept                     | merge                  |
| reject            | pass on it                 | reject, decline, close |
| revert            | restore an earlier version | revert, rollback       |
| fork storyboard   | write my own version       | fork, clone            |
| invite            | invite a co-author         | add collaborator       |

### 2.3 Tone rules

Sentence case everywhere. A button names its consequence: _Accept into main draft_, not _Submit_. The word that survives from the git world is **version** — writers already own it, and it does the work of branch, commit, and revision at once.

---

## 3. Roles and permissions

### 3.1 Roles

| Role        | How obtained                                        | Cap                                           |
| ----------- | --------------------------------------------------- | --------------------------------------------- |
| Owner       | created the storyboard                              | exactly 1, non-transferable in v1             |
| Co-author   | invited by owner, accepted                          | 3 per storyboard                              |
| Contributor | submitted an accepted suggestion to this storyboard | unlimited                                     |
| Reader      | any signed-in user, on a public storyboard          | unlimited                                     |
| Guest       | not signed in                                       | read-only, public storyboards, marketing site |

Contributor status is a historical fact, not a live permission grant. A contributor has no standing write access.

### 3.2 Permission matrix

| Capability                             | Owner | Co-author | Reader | Guest |
| -------------------------------------- | ----- | --------- | ------ | ----- |
| Read public storyboard                 | ✓     | ✓         | ✓      | ✓     |
| Read private storyboard                | ✓     | ✓         | —      | —     |
| Edit main draft directly               | ✓     | ✓         | —      | —     |
| Create / reorder chapters and sections | ✓     | ✓         | —      | —     |
| Open a contribution request            | ✓     | ✓         | —      | —     |
| Accept or pass on a suggestion         | ✓     | ✓         | —      | —     |
| Restore an earlier revision            | ✓     | ✓         | —      | —     |
| Create an alternate version            | ✓     | ✓         | —      | —     |
| Invite a co-author                     | ✓     | —         | —      | —     |
| Change visibility                      | ✓     | —         | —      | —     |
| Delete storyboard                      | ✓     | —         | —      | —     |
| Submit a suggestion                    | ✓*    | ✓*        | ✓      | —     |
| Post an idea                           | ✓     | ✓         | ✓      | —     |
| Spin off (own copy)                    | ✓     | ✓         | ✓      | —     |
| Report a user or storyboard            | ✓     | ✓         | ✓      | —     |

\* Owners and co-authors bypass the three-suggestion quota on their own storyboard (FR-13.2).

---

## 4. Object model (conceptual)

```
User
 └─ Storyboard            owner, visibility, genres, type, spun off from?
     ├─ Collaborator      co-authors (≤3)
     ├─ Version           "the main draft" | "alternate version"   (is_main, base_version)
     │   └─ Chapter       ordered                                  (lineage_id)
     │       └─ Section   ordered, the atomic unit of contribution (lineage_id)
     │           ├─ Revision          append-only chain, parent_id
     │           └─ ContributionRequest
     │               ├─ Suggestion    prose, mergeable, quota'd
     │               └─ Idea          short, not mergeable, not quota'd
     └─ Credit            permanent, survives revert and spin-off
```

**Section is the atomic unit of contribution.** A request is always attached to exactly one section. Chapters exist for navigation and reading order only; nothing is ever contributed to a chapter.

**Every object has a URL.** `/s/{storyboard-slug}` · `/s/{slug}/c/{chapter-no}` · `/s/{slug}/c/{chapter-no}/{section-slug}` · `/s/{slug}/help/{request-id}` · `/s/{slug}/help/{request-id}/s/{suggestion-id}`. An alternate version is a query param on the storyboard routes: `?v={version-slug}`. Main draft needs no param.

---

## 5. Functional requirements

### FR-1 — Accounts and first session

- **FR-1.1** The marketing site (`storyboard.com`) is fully public and requires no account. It shows what the product is, two real example storyboards in read-only form, and a single sign-up call to action.
- **FR-1.2** The application (`app.storyboard.com`) requires an account for every route except public storyboard reading, which a guest may do with a persistent "sign in to help" affordance.
- **FR-1.3** Sign-up is: email → verification link → set password → choose username → pick at least three genres. Username is immutable in v1 and appears in credit lines forever; warn at the point of choosing.
- **FR-1.4** Verification link expires in 24 hours and is re-sendable with a 60-second cooldown.
- **FR-1.5** After onboarding the user lands on the dashboard, never on an empty state. If they have no storyboards, the dashboard shows open requests matching their chosen genres.
- **FR-1.6** Authentication is email and password in v1. OAuth is deferred; do not build the abstraction for it now beyond what Auth.js gives free. _(A Google provider exists and is inert unless AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set; email and password is the supported path. Decision 0027.)_

**Sixty-second target:** a new user reads a real stuck passage within 60 seconds of landing on the marketing site, without an account. The account wall sits in front of _helping_, not _reading_.

### FR-2 — Storyboards, chapters, sections

- **FR-2.1** Creating a storyboard requires: title, type (novel · novella · short story · screenplay · stage play · serial · poetry collection · non-fiction · other), one to three genres, and visibility (public or private). Everything else is optional and editable later.
- **FR-2.2** A new storyboard is created with one version (`is_main = true`, name "Main draft"), one chapter, and one empty section. The writer is never shown a blank slate with no structure.
- **FR-2.3** Chapters and sections are both ordered lists with drag reordering. Reordering rewrites `order` for all siblings in one transaction.
- **FR-2.4** A writer can split a section at the cursor, and merge a section into the one above it. Split creates a new section with a new lineage; merge marks the absorbed section `merged_into` and keeps its revision history addressable.
- **FR-2.5** Section soft targets: 200–2000 words. Show a live word count; warn above 2000 that the section may be too large for anyone to help with; do not block.
- **FR-2.6** Deleting a storyboard is soft for 30 days, then hard. A storyboard with active credits shows a confirmation naming the affected contributors.
- **FR-2.7** Visibility is per storyboard, set at creation, changeable by the owner. Switching public → private closes all open requests and notifies anyone with a suggestion in flight. Switching private → public does not retroactively expose revision history authored while private — history is exposed from the switch point forward, earlier revisions are readable by owner and co-authors only. _(This is a deliberate protection; see §9 open decision OD-4 if you disagree.)_

### FR-3 — Import

- **FR-3.1** Accepted formats: `.docx`, `.md`, `.txt`, `.rtf`, `.fountain`, `.fdx`. Max 5 MB, max 300,000 words.
- **FR-3.2** Import is two-stage and never silent. Stage one parses and _proposes_ a chapter/section split. Stage two shows a review screen where the writer confirms, moves, adds, or removes every proposed boundary before anything is saved.
- **FR-3.3** Chapter detection runs a cascade of deterministic strategies, first hit wins, and reports which one it used so the writer knows how much to trust it:
  1. `.docx` — paragraphs styled `Heading 1` / `Heading 2`.
  2. `.md` — `#` and `##`.
  3. `.fountain` / `.fdx` — scene headings (`INT.` / `EXT.`) and act breaks.
  4. Explicit page breaks (`.docx` `w:br type="page"`).
  5. Regex on standalone short lines: `^\s*(chapter|part|act|book)\s+([0-9]+|[ivxlc]+|one|two|…)\b`, case-insensitive.
  6. Standalone lines under 60 characters, no terminal punctuation, surrounded by blank lines, and either title case or upper case.
  7. Nothing matched — one chapter, sections split at every blank-line-separated block over 1200 words.
- **FR-3.4** Scene-break detection, applied _within_ a chapter to propose section boundaries: `***`, `* * *`, `#`, `~`, `—`, `<<<>>>`, three or more centred blank-surrounded glyphs, or a run of two or more blank lines.
- **FR-3.5** The review screen shows detected boundaries on a scrubbable outline with the first 12 words of each proposed section. Confidence is shown per boundary as "from a heading style" / "from a page break" / "guessed from the text" — never as a number.
- **FR-3.6** No AI is used at any point in import. If the cascade produces nonsense, that's what the review screen is for. (FR-1.3 principle.)
- **FR-3.7** What survives an import is documented in the UI before the file is chosen, not after:

| Preserved                                           | Dropped                                     |
| --------------------------------------------------- | ------------------------------------------- |
| Paragraphs, italic, bold, blockquote                | Fonts, sizes, colours, line spacing         |
| Headings 1–3                                        | Tables, text boxes, embedded images         |
| Scene breaks (converted to a break node)            | Headers, footers, page numbers              |
| Screenplay element types, from `.fountain` / `.fdx` | Comments, tracked changes, revision colours |
| Footnote text, appended to section end              | Footnote numbering and links                |

### FR-4 — The editor and the document model

- **FR-4.1** One canonical document format for all stored prose: a restricted ProseMirror JSON schema. Nodes: `doc`, `paragraph`, `heading` (1–3), `blockquote`, `scene_break`, `hard_break`. Marks: `em`, `strong`, `strike`. Nothing else is storable; paste is filtered to this set.
- **FR-4.2** Screenplay-type storyboards use an extended node set: `scene_heading`, `action`, `character`, `parenthetical`, `dialogue`, `transition`. Rendered in Courier Prime at industry margins.
- **FR-4.3** Every revision stores both `content_json` (canonical) and `content_text` (flattened plain text) — the second for word counts, diffing, and search, regenerated from the first on write, never edited directly.
- **FR-4.4** Autosave writes a draft every 3 seconds of inactivity, and a durable revision on blur, on navigation, or every 5 minutes of continuous editing — whichever comes first. Drafts are per user, per section; revisions are per version.
- **FR-4.5** Editing someone else's section never touches their content. Opening the editor on a section you do not own creates a private draft in your own account, visible only to you, until you send it as a suggestion (FR-6).
- **FR-4.6** The editor has no formatting toolbar beyond italic, bold, blockquote, and scene break. Keyboard shortcuts for each. This is a manuscript, not a document.

### FR-5 — Contribution requests (the stuck point)

- **FR-5.1** A request is opened on exactly one section by an owner or co-author. A section can have at most one open request at a time.
- **FR-5.2** Three request kinds, chosen at creation, because they need different responses:

| Kind       | Section state                                      | What comes back                              | Mergeable |
| ---------- | -------------------------------------------------- | -------------------------------------------- | --------- |
| `rewrite`  | has prose the author is unhappy with               | a suggestion (prose)                         | yes       |
| `continue` | empty or a stub — "chapter four doesn't exist yet" | a suggestion (prose)                         | yes       |
| `unblock`  | either                                             | an idea (plot options, diagnosis, direction) | no        |

`unblock` is the answer to "I want to comment, not rewrite." It is a full request kind, not a lesser one, and it carries no word minimum.

- **FR-5.3** Required on every request: a short title, and an ask of 20–500 words ("what's wrong / what I need").
- **FR-5.4** **Pre-context** is required for `rewrite` and `continue`: 100–500 words of the story so far, written by the author. This is the answer to "do I have to read chapters 1–3 first." A helper should be able to work from the pre-context alone.
- **FR-5.5** The author may additionally mark specific earlier sections as **suggested reading**. These render as a collapsible reading list on the request page, in order, inline — never as links that navigate away.
- **FR-5.6** Optional per request: tone notes, character notes, hard constraints ("she cannot die", "stay in first person"). Constraints render as a checklist on the composer so the helper can see them while writing.
- **FR-5.7** A `rewrite` request requires the target section to hold at least 150 words. A `continue` request requires the target section to be under 150 words. Both are enforced at creation with a plain-language error.
- **FR-5.8** Word bounds for suggestions default to 150 min / 1000 max and are adjustable by the author within 100–2000. Shown to the helper as a live counter, enforced on submit.
- **FR-5.9** A request has states: `open`, `answered` (has ≥1 undecided suggestion), `resolved` (a suggestion was accepted), `closed` (author closed it without accepting). Authors can reopen a `resolved` or `closed` request; reopening notifies everyone who has ever submitted to it.
- **FR-5.10** Closing a request does not delete its suggestions. They remain readable at their URLs forever, marked as not accepted.

### FR-6 — Suggestions and ideas

- **FR-6.1** A suggestion begins as a private draft (FR-4.5) pre-filled with the current section text for `rewrite`, empty for `continue`. The helper edits freely. Nothing is visible to anyone until sent.
- **FR-6.2** Sending requires: word count within bounds, and an optional note to the author of up to 200 words explaining the approach. The note is shown above the prose on the review screen.
- **FR-6.3** A suggestion records `base_revision_id` — the revision it was written against. This is the mechanism for staleness (FR-6.7).
- **FR-6.4** Suggestion states: `draft` · `submitted` · `accepted` · `passed` · `stale` · `withdrawn`. Only `submitted` counts against the quota (FR-13.2).
- **FR-6.5** A helper may withdraw a `submitted` suggestion at any time before a decision. Withdrawal frees quota and notifies the author only if the author had already opened it.
- **FR-6.6** **Exactly one suggestion can be accepted at a time.** Acceptance is a serialised transaction on the section row. If a second acceptance is attempted concurrently, it fails with "this section changed a moment ago" and re-renders against the new head.
- **FR-6.7** When a suggestion is accepted, every other `submitted` suggestion on that section whose `base_revision_id` no longer matches the section head is marked `stale`. Their authors are notified: _"The section you helped with has changed. Your suggestion is still here — update it against the new text, or leave it."_ A stale suggestion can be revised and re-sent without consuming additional quota.
- **FR-6.8** An author may accept a second suggestion after a first. The second is written against the new head, so it replaces the first's text unless the helper rebased it. Both credits persist — accepting Leah's chapter 4 and later Arjun's rewrite of it credits both, with Arjun's text live and Leah's credited on an earlier revision.
- **FR-6.9** **Ideas** (for `unblock` requests) are 20–400 words, plain text, threaded one level deep so the author can reply. Ideas are never merged and never create revisions. They create a credit of type `idea` only if the author marks one as _helped_ — a single button, one per request, optional.
- **FR-6.10** Passing on a suggestion requires no written reason. The author may optionally attach one of a fixed set of chips — _not the direction I want_ · _doesn't fit the voice_ · _too far from the outline_ · _I've solved it another way_ — chosen in one click. No free-text field. Notification to the helper reads as information, not verdict: _"Maya went a different way on chapter 4. Your version is still on your profile."_
- **FR-6.11** A passed suggestion stays permanently readable at its URL and appears on the helper's profile under work they've done, distinct from accepted work.

### FR-7 — Comparison

- **FR-7.1** The comparison view is side by side by default, original left, proposed right, scroll-locked. A single toggle switches to a stacked read-through of the proposed text alone, with no marks at all — for the case where the text was rewritten and marks are noise.
- **FR-7.2** Comparison is computed at three levels, in this order:
  1. **Paragraph alignment.** Split both texts into paragraphs. Align with a longest-common-subsequence pass over normalised paragraph hashes, then a second pass matching remaining unmatched paragraphs by token similarity (Dice coefficient on word bigrams) above 0.45.
  2. **Word-level marks** inside aligned pairs, using `diffWordsWithSpace`. Deletions struck on the left, insertions underlined on the right, in blue pencil.
  3. **Rewrite detection.** If fewer than 30% of paragraphs align, mark-level output is suppressed entirely and the view opens in read-through mode with a plain banner: _"This is a rewrite rather than an edit — reading it straight will be easier than looking at marks."_
- **FR-7.3** Never diff below the word. No character-level marks; they are unreadable on prose.
- **FR-7.4** A section-level summary bar shows paragraphs kept / changed / added / removed as four counts. No percentages, no scores.
- **FR-7.5** The same comparison view serves three cases with no variant code paths: suggestion vs current text, revision vs earlier revision, and alternate version vs main draft. Inputs are always two revision ids.

### FR-8 — Accepting, restoring, and history

- **FR-8.1** Accepting creates a new `Revision` whose `parent_id` is the current head, whose content is the suggestion's content, whose `author_id` is the _contributor_, and whose `accepted_by_id` is the deciding author. Both names appear in history.
- **FR-8.2** Every revision is immutable and permanently addressable. Nothing in this product hard-deletes prose except storyboard deletion (FR-2.6) and account deletion.
- **FR-8.3** The history panel for a section is a vertical list of revisions with author, date, source (written by the author · accepted from a suggestion · restored), and a one-tap comparison against the current head.
- **FR-8.4** Restoring an earlier revision creates a _new_ revision with the old content, never rewinds the chain. The panel labels it "restored from 12 Sep".
- **FR-8.5** If a restore removes text that came from an accepted suggestion, the contributor is notified: _"Some of your writing in chapter 4 is no longer in the main draft. Your contribution is still on your profile and in the history."_ The `Credit` row is marked `is_live = false` but is never deleted (principle 1.3.3).
- **FR-8.6** No reason field on restore. Chips as in FR-6.10, optional.

### FR-9 — Credit and profile

- **FR-9.1** A `Credit` is created on: suggestion accepted (`type = prose`), idea marked as helped (`type = idea`), co-author invitation accepted (`type = coauthor`). It stores storyboard, section lineage, revision, contributor, and timestamp.
- **FR-9.2** Every storyboard page shows a contributors strip: avatars with counts, linking to the full credits page listing every contribution with its section and date.
- **FR-9.3** A profile shows: storyboards authored · contributions accepted · ideas that helped · spin-offs created · a contribution calendar (365-day grid, one cell per day, intensity by count — the GitHub pattern, because it is legible and writers already understand streaks) · and a reverse-chronological feed of accepted work with excerpt and link.
- **FR-9.4** Suggestions that were passed on appear on the profile in a separate, collapsed section, labelled honestly ("written but not used"), only visible to the profile owner by default with a toggle to make public. Defaulting these to public would make passing feel punitive.
- **FR-9.5** Credits survive spin-offs. A spin-off's credits page shows the original storyboard, its author, and every credit inherited at the point of the spin-off, above any credits earned since.
- **FR-9.6** A credit line is exportable as plain text for a manuscript's front matter: name, role, chapter, date, and the permanent URL.

### FR-10 — Alternate versions and spin-offs

- **FR-10.1** An **alternate version** stays inside the storyboard and belongs to the owner or a co-author. Creating one copies the full chapter/section tree at the current head. Use: the author wants to try a different chapter 4 without losing the current one.
- **FR-10.2** An alternate version can be promoted to main. Promotion swaps `is_main` and records the swap in storyboard history. The previous main is retained as an alternate version, never discarded.
- **FR-10.3** A **spin-off** creates a new storyboard owned by the person spinning off, with `forked_from_id` and `forked_from_revision_map` recorded. The original author is not asked for permission on a public storyboard and is notified.
- **FR-10.4** A spin-off does not track the original. Later chapters the original author writes do not appear. The spin-off page shows a banner: _"Spun off from [title] by [author] on 12 Sep — that story has continued since."_ with a link. This is the honest, cheap answer; live tracking is deferred indefinitely.
- **FR-10.5** Spin-offs of spin-offs are permitted. Lineage is displayed as a chain, truncated to three ancestors with a "see full lineage" link.
- **FR-10.6** The original storyboard shows a spin-off count and a list. Authors cannot delete someone else's spin-off. They can report it (FR-13.5).
- **FR-10.7** Spinning off a **private** storyboard is not possible. Only people who can read it could spin it off, and they are co-authors, who already have alternate versions.

### FR-11 — Discovery

- **FR-11.1** The dashboard has three regions: storyboards you're writing · requests you've helped with that have news · open requests in your pinned genres.
- **FR-11.2** Genre pinning is set in onboarding (FR-1.3) and editable. Pinned genres drive the third region and nothing else — no opaque ranking in v1.
- **FR-11.3** The browse page filters on genre, type, request kind, word bounds, and age. Default sort is _recently opened_; alternatives are _closing soon_ (approaching a 30-day auto-nudge) and _no answers yet_.
- **FR-11.4** A storyboard card shows title, author, type, genres, word count, and a badge with the number of sections open for help. The badge is the primary call to action, not the title.
- **FR-11.5** Opening a storyboard from browse lands on the reading view with the manuscript centred and open requests in the right margin, each tied to its section by a leader rule. Clicking a margin card scrolls the manuscript to that section and highlights it.
- **FR-11.6** No global search in v1 beyond title and author name. Full-text search over manuscripts is deferred and has privacy implications worth thinking about first.

### FR-12 — Notifications

- **FR-12.1** In-app notification centre plus email. Every notification type is independently toggleable for email; in-app cannot be disabled.
- **FR-12.2** Events: suggestion received · suggestion accepted · suggestion passed · suggestion went stale · idea received · idea marked as helped · co-author invitation · invitation accepted · spin-off created · your contributed text was removed · request has had no answers for 7 days (author only) · weekly digest.
- **FR-12.3** Email is batched. Immediate for decisions on your own work; hourly digest for everything else; weekly digest on Sunday for open requests in your genres.
- **FR-12.4** The seven-day silence nudge to the author offers two one-click actions: widen the word bounds, or post the request to the weekly digest. It never says the request failed.
- **FR-12.5** All emails are plain, single-column, and link to a canonical URL. No tracking pixels.

### FR-13 — Trust, safety, and rate limits

- **FR-13.1** A suggestion must be within the request's word bounds (FR-5.8). Enforced client and server side.
- **FR-13.2** **Quota.** A contributor may hold at most **3 suggestions in `submitted` state per storyboard**. Accepting, passing, withdrawing, or going stale frees a slot. Drafts do not count. Owners and co-authors are exempt on their own storyboards.
- **FR-13.3** Global rate limits: 10 suggestions sent per user per day · 20 ideas per user per day · 3 ideas per request · 5 storyboards created per user per day · 1 spin-off of a given storyboard per user per day.
- **FR-13.4** Every user sees the community rules once at sign-up and they live at a permanent URL. They cover: what a good suggestion is, the quota and why it exists, that authors may pass without explanation, and that unpublished work is being trusted to you.
- **FR-13.5** Reporting: a user, a storyboard, a suggestion, or an idea can be reported with a category (spam · abuse · plagiarism · off-topic · lifted work). **10 upheld reports** against a user suspends the account pending review. Reports from the same reporter against the same target are deduplicated. Raw report counts are never shown publicly.
- **FR-13.6** **The copying problem, stated honestly.** Screenshots and copy-paste cannot be prevented in a browser; the product will not pretend otherwise. What it does instead, and what it says on the visibility selector at creation time:
  - Every revision is timestamped and content-hashed at write time, giving the author a verifiable, publicly linkable record of when they wrote it. This is the only defence that actually works, and it works well.
  - A one-tap "proof of authorship" export produces a signed PDF: title, author, section, word count, SHA-256 of the content, and timestamp.
  - Manuscript exports carry a visible footer with author, contributors, and source URL.
  - The visibility selector says, in plain words: _"Anyone can read a public storyboard, and anyone can copy what they read. Timestamps prove you wrote it first. If that isn't enough for this manuscript, keep it private and invite people you know."_
  - Deferred, and to be described as deferred rather than promised: disabling right-click, watermarking on-screen text, plagiarism-database registration. The first two are trivially defeated; the third needs a partner.
- **FR-13.7** Moderation is the owner's own time in v1. Design for that: reports queue into a single admin screen with one-key decisions, and suspension is reversible.

### FR-14 — Publishing and export

- **FR-14.1** An author can mark a storyboard _finished_. A finished storyboard gets a reading page with no margin, no request cards, and a contributors page linked from the foot.
- **FR-14.2** Export formats: `.docx`, `.md`, `.pdf`, `.epub`, `.fountain` for screenplays. All delivered; `.epub` arrived in phase 9.
- **FR-14.3** Every export embeds a contributors page in the front matter, and a footer line with the source URL. This is not removable from within the product.
- **FR-14.4** Publishing outside the platform is explicitly permitted and unencumbered. The product makes no legal claim on the work. The community rules ask, without enforcing, that contributors be credited wherever it goes.
- **FR-14.5** Licensing is **deferred entirely**. v1 stores an optional free-text rights note on the storyboard, displayed as the author wrote it, with no verification and no implied endorsement. Do not build a licence picker that looks authoritative.

### FR-15 — Seeding and admin

- **FR-15.1** Launching with zero storyboards and zero helpers is the highest single risk. Seed the **request** side, not the helper side — a helper with nothing to answer bounces permanently; an author with no answers yet is a normal state.
- **FR-15.2** Seed content must be legally clean. Use public-domain texts (Project Gutenberg, pre-1929 US) as source manuscripts, with genuine stuck points written by hand. Do not scrape contemporary fiction from writing sites; it is copyrighted, and doing so on a platform whose pitch is trust would be fatal.
- **FR-15.3** Every seeded storyboard is labelled _example_ in the UI and attributed to a platform account. Never make a seeded storyboard look like a real user's. Discovery of a fake community is the one unrecoverable launch failure.
- **FR-15.4** Target at launch: 25 seeded storyboards across at least 6 genres, 40 open requests spanning all three kinds, 15 already-answered requests showing accepted suggestions and comparison views — so a visitor can see the full loop working before participating.
- **FR-15.5** Admin screens: report queue, user suspension, seeded-content manager, feature flags.
- **FR-15.6** Seeds live in `prisma/seed/` as committed data files and are idempotent.

---

## 6. Screen inventory

| #   | Screen                | Route                               | Notes                                                                                                                 |
| --- | --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Marketing home        | `storyboard.com/`                   | Hero is a real stuck passage with a real accepted suggestion beside it, readable without an account (FR-1.1).         |
| 2   | Sign up / sign in     | `/signin`, `/signup`                | Four steps, one per screen (FR-1.3).                                                                                  |
| 3   | Dashboard             | `/`                                 | Three regions (FR-11.1).                                                                                              |
| 4   | Browse                | `/browse`                           | Filters left, cards right (FR-11.3).                                                                                  |
| 5   | **Storyboard reader** | `/s/{slug}`                         | The core screen. Contents rail · manuscript at reading measure · margin of request cards with leader rules (FR-11.5). |
| 6   | Section editor        | `/s/{slug}/c/{n}/{section}/edit`    | Owner only. Distraction-free, minimal toolbar (FR-4.6).                                                               |
| 7   | Open a request        | `/s/{slug}/help/new`                | Kind picker first, then a form that changes per kind (FR-5.2).                                                        |
| 8   | Request detail        | `/s/{slug}/help/{id}`               | Ask, pre-context, constraints, suggested reading, list of responses.                                                  |
| 9   | Suggestion composer   | `/s/{slug}/help/{id}/write`         | Constraints pinned, word counter, current text collapsible alongside.                                                 |
| 10  | Comparison            | `/s/{slug}/help/{id}/s/{sid}`       | Side by side, accept / pass at the foot (FR-7).                                                                       |
| 11  | History               | `/s/{slug}/c/{n}/{section}/history` | Revision list, compare any two (FR-8.3).                                                                              |
| 12  | Versions              | `/s/{slug}/versions`                | Main draft and alternates, promote, compare.                                                                          |
| 13  | Profile               | `/@{username}`                      | Credits, calendar, authored work (FR-9.3).                                                                            |
| 14  | Credits page          | `/s/{slug}/contributors`            | Everyone who helped, with sections and dates.                                                                         |
| 15  | Import                | `/import`                           | Upload, then the boundary review screen (FR-3.2).                                                                     |
| 16  | Settings              | `/settings`                         | Account, genres, notifications, visibility defaults.                                                                  |
| 17  | Admin                 | `/admin`                            | Reports, suspensions, seeds (FR-15.5).                                                                                |

---

## 7. Non-functional requirements

- **NFR-1 Performance.** Reader view first contentful paint under 1.2 s on a 3G-fast profile. A 120,000-word storyboard renders chapter-by-chapter; never ship the whole manuscript in one payload.
- **NFR-2 Comparison cost.** Diff computation is server-side, cached by `(base_revision_id, target_revision_id)`, and must complete under 400 ms for a 2000-word section.
- **NFR-3 Data integrity.** Revisions are append-only at the database level: no `UPDATE` on `Revision.content_json`, enforced by a trigger, not only by application code.
- **NFR-4 Accessibility.** WCAG 2.2 AA. The manuscript is the content; it must be navigable by keyboard and readable by a screen reader with correct heading structure. Comparison marks must not rely on colour alone — deletions are struck, insertions underlined.
- **NFR-5 Reading comfort.** Manuscript measure 62–68 characters, adjustable type size and line height persisted per user. Serif by default.
- **NFR-6 Privacy.** Private storyboard content never leaves the database for any user without a permission check at the data layer, not the route layer.
- **NFR-7 Observability.** Structured logs on every accept, pass, revert, spin-off, and report. These are the events you will need to reason about when something goes wrong socially.
- **NFR-8 Backups.** Daily automated Postgres backup with 30-day retention before the first real user. This is unpublished work; losing it once ends the project's reputation.
- **NFR-9 Open source hygiene.** `CONTRIBUTING.md`, a licence (AGPL-3.0 recommended if you want spin-offs of the _code_ to stay open), issue templates, and a `good first issue` label from the first public commit.

---

## 8. Deferred, with reasons

| Feature                             | Why not now                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time collaborative editing     | Decides your entire stack (CRDT, websockets, presence). The branch model gives asynchronous collaboration for free. Build it in its own surface later, for invited groups only. |
| AI summaries of prior chapters      | Principle 1.3.1. The pre-context field (FR-5.4) does the same job, written by a human who knows the story.                                                                      |
| Licence verification                | Requires legal judgement you cannot automate. FR-14.5 stores a note instead.                                                                                                    |
| Section locking while someone works | Contradicts the quota model — multiple people should be able to try.                                                                                                            |
| Full-text manuscript search         | Privacy implications on unpublished work. Decide the policy first.                                                                                                              |
| Monetisation                        | Stated non-goal. Do not build billing abstractions "for later"; they leak into everything.                                                                                      |
| Mobile apps                         | Responsive web covers reading and deciding. Writing on a phone is not the use case.                                                                                             |
| Live spin-off tracking              | FR-10.4's banner is 2% of the cost and 80% of the value.                                                                                                                        |

---

## 9. Open decisions

These need your call before the phase that touches them.

- **OD-1 — The name.** _Storyboard_ collides hard with film and animation. Check trademarks and domains before phase 7. (Blocks phase 7.)
- **OD-2 — Anonymous helping.** Can someone help under a pseudonym separate from their account? Writers using pen names is normal. Currently no. (Blocks FR-9, phase 3.)
- **OD-3 — Contributor's right to be forgotten.** FR-8.5 keeps a credit row after their text is removed. Should a contributor be able to delete their own contribution record entirely, including from the author's history? GDPR says probably yes. (Blocks phase 4.)
- **OD-4 — Private history on going public.** FR-2.7 hides pre-switch revisions. The alternative — expose everything — is simpler and more honest to the "everything is traceable" principle. Pick one. (Blocks phase 1.)
- **OD-5 — Idea credit.** FR-6.9 lets an author mark one idea as helping. Is one enough, or should it be unlimited with no cap? One creates a decision the author may not want to make. (Blocks phase 2.)
- **OD-6 — Quota shared across co-authored storyboards.** If Maya co-authors with Sam, does Sam's quota apply on storyboards Maya owns? Currently exempt. Exploitable if co-authorship is easy to get. (Blocks phase 6.)
- **OD-7 — Age policy.** Young writers are a large part of this audience. Under-16 handling, and whether an adult stranger should be able to message them, needs a policy before launch, not after. (Blocks phase 7 — this one is not optional.) — _Answered in two halves by decision 0020, and one half withdrawn by decision 0026. There is no age gate: no age is asked and none is stored. The half that stands is that there are no private messages anywhere in the product and never will be, so there is no surface on which an adult stranger can write to a child unobserved. Open again in the narrower form: is that sufficient on its own?_
