# 0046 — Blocking a person

**Date:** 2026-10-18
**Status:** accepted (D-9, owner 2026-10-18); built as item 2.9 of `06-completion-plan.md`
**Amends:** nothing in the SRS; adds to FR-13 the one tool a writer has before a report

## Why

Reporting asks a moderator to act. Some help is not a matter for a moderator
at all: somebody whose suggestions a writer simply does not want any more.
Until now the only answers were to pass each one, or to report a person who
had broken no rule.

## The decision

**A small block.** `UserBlock { blockerId, blockedId }`. Someone you block:

- still reads every story, yours included, because blocking is about sending,
  not reading (the owner's words: "he can still have access to the story");
- cannot start a suggestion draft, send one, re-send a stale one, or post an
  idea on any story you own or co-write; the help buttons give way to one
  sentence and the server refuses with the same one: "This author isn't
  taking suggestions from you. You can still read the story.";
- tells you nothing: a notification that one of your authors would have had
  from their action is not written (`notifyAuthors`, the spin-off notice).

What they sent before stays, and can still be accepted or passed. Credit
already earned stays.

**Both sides are told.** Before confirming, the person blocking reads what
the block does and does not do. The blocked person is told on the story,
where they would have helped, rather than left to guess why the button went.
The owner's phrase was "let the author know"; read here as both sides, since
the other reading leaves the blocked person guessing.

**Enforced at the data layer (NFR-6).** `blockedByAuthors` in `lib/authz` is
the rule; `blockedFromHelping` and `assertNotBlocked` in `guard.ts` ask the
database, and only where help begins: the request page's permissions and the
four write procedures. Not on every read, which is the hot path.

## What this does not change

Reports and suspension (decision 0018); the quota (FR-13.2); the credit
rules (FR-9.1, decision 0041). A co-author's block counts for the story as
the owner's does: the story is theirs too.

## Consequences

A block is per person, not per story: block someone and they are out of all
your stories at once. A person blocked by one co-author of a story is out of
that story even if its owner never minded; the alternative, per-author
voting, is more than a small block should be.
