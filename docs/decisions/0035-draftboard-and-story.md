# 0035 — Draftboard, and what a writer makes is a story

**Date:** 2026-10-14
**Status:** accepted
**Implements:** phase 12, task 1
**Closes:** OD-1, deferred by decision 0021

## The decision

The product is **Draftboard**. The thing a writer makes, which the interface
called a storyboard, is a **story**: "Start a story", "Stories you are
writing", "Delete this story". Script and manuscript stay available by type, as
the vocabulary table already allowed.

## Why "story" and not keeping "storyboard"

The rename happened because "storyboard" belongs to film and animation. A
storyboard is the comic-strip plan of a shot list, and a writer meeting the word
expects drawings. Keeping it as the noun inside a product called Draftboard
would have kept the confusion while changing the name on the door. "Draft" was
not available: the main draft is a version (FR-5). "Project" is on the
never-say list. "Board" reads like a task tracker.

## What changed, and what deliberately did not

Everything a person sees: the wordmark, page titles and the title template, the
dashboard, the rules, settings, the reader, the history, the lineage page, the
verification email, error messages a person can be shown, report labels, the
marketing page, the `EMAIL_FROM` sender name (`.env` and Vercel), "Written on
Draftboard" in every export's front matter, and the proof-of-authorship PDF's
label.

The seeded platform account became `draftboard-examples`, "Draftboard
examples". The seed's library pass now sets the account's username, name and
biography on every run, so re-running the seed renames the live account in
place. Before, it only set them when creating the account. Its email, the key
the seed finds it by, keeps the old name, and is never shown.

`draftboard` joins the reserved usernames. `storyboard` stays there.

Not changed: the code. The Prisma model is still `Storyboard`, the packages are
still `@storyboard/*`, permission names are still `storyboard:read`, the
repository is still `storyboard`, and the epub identifier is still
`urn:storyboard:`. These are names for programmers, and renaming them is a large
change that nobody would see. Decision 0021 called it "cosmetic, and the largest
diff". Old decision records keep the old name too: they are history.

Files exported before the rename keep "Written on Storyboard", which is correct.
They say where they came from at the time.

## How it stays done

The vocabulary linter bans `storyboard` in interface copy, as it bans `merge`
and `commit`. It also learned that a `case` label compares a key rather than
showing text. The linter does not read server code. Server error messages,
email templates and the export package were swept by hand, line by line.
