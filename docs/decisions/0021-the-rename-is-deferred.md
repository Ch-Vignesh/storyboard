# 0021 — The rename is deferred, and here is what it touches

**Date:** 2026-09-15
**Status:** accepted
**Defers:** OD-1 (the name), which `03-build-plan.md` lists as blocking phase 7

## The decision

Phase 7 ships as **Storyboard**. OD-1 stays open.

## Why this does not block phase 7

The collision OD-1 names is real — "storyboard" belongs to film and animation in
most people's heads, and the domain almost certainly is not available. But it is
a trademark and marketing problem, and phase 7's exit criterion is about a
stranger reading a stuck passage and sending a suggestion in five minutes. None
of that changes with the name on it.

Holding the launch for a name would be holding it for a decision that can be
made at any time, including after.

## What the rename would touch, when it happens

Written down now, while it is all in view, so that whoever does it is not
discovering the list:

- **The string, in the interface.** The header wordmark, the page titles, the
  sign-in and sign-up screens, the community rules, the empty states.
- **`packages/export`** — `sourceLine()` writes "Written on Storyboard — {url}"
  into the front matter of every `.docx`, `.md`, `.pdf` and `.fountain`. Files
  already exported keep the old name, which is correct: they say where they came
  from at the time.
- **The email sender and templates** — `EMAIL_FROM`, and the wordmark in every
  message.
- **The domains** — `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_MARKETING_URL`, and
  the two Vercel projects behind them.
- **The seeded platform account** (FR-15.3), which owns every example
  storyboard and is named in the interface.
- **The repository and package names** — `@storyboard/*` across seven
  workspaces. Cosmetic, and the largest diff.
- **`docs/`** — the SRS, the architecture, this file.

## What was considered and rejected

**Putting the name behind a constant first.** It would make the eventual change
one line, and it was rejected because it buys little and costs clarity: most
occurrences are in prose written for a reader ("Written on Storyboard"), and
prose assembled from variables reads like it was assembled from variables. A
find-and-replace on a distinctive word is a job of an hour, once.

## When to revisit

Before any paid marketing, and before the domain is registered. Not before
launch.
