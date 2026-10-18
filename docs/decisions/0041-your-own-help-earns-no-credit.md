# 0041 — Your own help on your own story earns no credit

**Date:** 2026-10-18
**Status:** accepted; confirmed by the owner on 2026-10-18 (D-13 in `06-completion-plan.md`): owning the story is the credit. The owner also suggested showing what share of a story is its author's own words, which is item 6.17
**Amends:** the reading of FR-6.9 and FR-9.1

## Why

A credit is the product's whole promise: a durable, addressable record that
a human helped (principle 1.3.3). Two places gave one for help that was not
help from anyone else.

- `idea.markHelpful` accepted any idea, so an author could mark a reply, or
  an idea they had posted themselves under their own request, and be
  credited for it.
- `suggestion.accept` always created a `PROSE` credit, so an owner or an
  accepted co-author who sent a suggestion on their own story, and accepted
  it, appeared on the contributors strip and on their own profile as a
  contributor to their own work.

Neither is fraud; both are noise, and noise in the one record the product
asks people to trust.

## The decision

- Only an idea from outside the story can be the one that helped: a
  top-level idea whose writer is not the owner or an accepted co-author.
  `markHelpful` refuses a reply, and an author's own idea, with
  "Only an idea from outside the story can be the one that helped." The
  thread offers the button only where it would succeed.
- Accepting a suggestion from an owner or co-author creates no credit. The
  check is made at the moment of accepting: somebody who was a reader when
  they sent it and a co-author by the time it is accepted is an author now,
  and is credited as one. The revision still records them as its author
  (FR-8.1), so the history is complete; only the credit row is withheld.

## What this does not change

Co-authors still earn the `COAUTHOR` credit on accepting an invitation
(FR-9.1), which is the record of their role, and everything they write
directly is attributed in the history as before.

## If the owner decides otherwise

Both rules are one check each: the refusals in `idea.markHelpful` and the
guard before the `credit.create` in `suggestion.accept`. The tests that pin
them are in `routers/idea.test.ts` and `routers/integrity.test.ts`.
