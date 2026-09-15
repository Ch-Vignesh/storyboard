# 0014 — A head revision can be shared between versions

Date: 2026-09-15 · Status: accepted

## Context

`02-architecture.md` section 2.2 describes creating an alternate version:

> Creating a version copies every `Chapter` and `Section` row, plus a pointer to
> each section's current `Revision`. Revisions themselves are **not** copied —
> they are immutable and shared.

and section 2.3 relies on it:

> A section's history is the chain `Revision.parent_id`. It crosses version
> boundaries naturally, because revisions are shared.

The Prisma schema written in phase 0 modelled the head as a one-to-one
relation, which put a unique index on `Section.currentRevisionId`. That index
permits exactly one section per revision, so the copied section could not point
at the shared revision — the second version would have had no head at all.

Nothing detected this for three phases because nothing had copied a tree yet.
Phase 4 is the first code that does.

## Decision

The head is one-to-many: one revision, many sections. The unique index is
dropped and `Revision.headOf` becomes `Section[]`.

This is not a change to the architecture; it is the schema catching up with it.
Sharing is safe precisely because of NFR-3: a revision cannot be updated, so two
sections referring to one cannot interfere with each other. The only thing that
moves when a version is edited is which revision its section points _at_.

## Consequences

- Creating a version is a tree copy of rows that carry no prose. A 120,000-word
  novel's alternate version is a few hundred small rows and no JSON at all.
- A section's history genuinely crosses versions, as section 2.3 promises: both
  sections walk back through the same `parentId` chain to a shared ancestor,
  which is what makes cross-version comparison (FR-7.5) meaningful.
- Anything that looked up "the section this revision heads" and expected one
  answer now gets a list. Nothing did.
- The lesson worth keeping: a one-to-one relation in Prisma is a unique index,
  and a unique index is a claim about the world. This one was false.
