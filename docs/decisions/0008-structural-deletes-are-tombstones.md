# 0008 — Deleting a chapter or a section is a tombstone, not a delete

Date: 2026-09-14 · Status: accepted

## Context

Phase 1 task 5 asks for chapters and sections that can be created, renamed,
deleted and reordered (FR-2.3). "Deleted" is the word that needed resolving,
because two other requirements constrain it:

- FR-8.2: "Every revision is immutable and permanently addressable. Nothing in
  this product hard-deletes prose except storyboard deletion (FR-2.6) and
  account deletion."
- The invariants migration (`20260912000100_invariants`) enforces that with a
  trigger, and its `storyboard.hard_delete` escape hatch is documented as
  existing for exactly those two jobs.

So a chapter delete cannot cascade into `Revision`. The first implementation
reached for the escape hatch, which would have quietly made it a third caller
and hollowed out NFR-3.

`02-architecture.md` section 3 gives `Chapter` and `Section` no soft-delete
column, so this is a deviation from the architecture as written.

## Decision

`Chapter` and `Section` each gain a nullable `deletedAt`. Deleting either sets
it and renumbers the surviving siblings; nothing is removed from the database
and every `Revision` underneath stays addressable at its URL.

This is the shape the schema already uses for the same problem: FR-2.4's merge
sets `Section.mergedIntoId` and explicitly "keeps its revision history
addressable". A structural delete is the same event with no destination.

Every query that builds reading order filters `deletedAt: null`, alongside the
`mergedIntoId: null` filter it already carried. Two partial indexes in
`20260914151718_chapter_and_section_tombstones` cover exactly that access
pattern.

A version keeps at least one chapter and a chapter at least one section, so
FR-2.2's promise that a writer is never shown a structure-less storyboard holds
after a delete as well as at creation.

## Consequences

- The hard-delete escape hatch still has exactly two callers, both of which are
  whole-storyboard or whole-account events, and NFR-3 means what it says.
- A restore of a deleted chapter is now possible and nearly free. It is not
  built in phase 1 — nothing in the SRS asks for it — but the data is there if
  FR-2.6's grace period turns out to want a sibling.
- Word counts, credits and history all keep working against tombstoned rows
  without special cases, because the rows still exist.
- Anything that counts sections must remember the filter. This is the cost, and
  it is why the two partial indexes name the exact predicate rather than
  leaving it to the planner.
