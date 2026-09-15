# 0013 — A contributor can erase their record; the revision stays

Date: 2026-09-15 · Status: accepted · Resolves: OD-3

## Context

`01-srs.md` section 9 leaves OD-3 open and it blocks phase 4, which copies
credits into spin-offs (FR-9.5) and so needs to know what a credit is.

Three requirements pull against each other:

- Principle 1.3.3 and FR-8.5: a credit is permanent, and removing the
  contributed text does not remove the record of the contribution.
- FR-8.2: revisions are immutable and permanently addressable, enforced by a
  trigger (NFR-3).
- GDPR Article 17: a person can ask for their personal data to be erased, and
  "their name is attached to this paragraph forever" is personal data.

The tension is real and the SRS says so: "GDPR says probably yes."

## Decision

A contributor may erase their contribution record. The revision stays and is
re-attributed.

Concretely, on an erasure request:

| Thing                        | What happens                                      |
| ---------------------------- | ------------------------------------------------- |
| `Credit` row                 | `erasedAt` set; contributor link cleared          |
| Credit line in the interface | "a former contributor", with no link              |
| `Revision.authorId`          | cleared; the revision and its prose are untouched |
| The prose in the draft       | unchanged                                         |
| The suggestion at its URL    | unchanged, but shown without a name               |
| Their profile                | the contribution is gone from it entirely         |

The person disappears. The writing does not.

This is the only split that satisfies all three. Erasing the revision as well
would let one person silently alter another's manuscript months later, possibly
after publication — the author's draft is the author's work once accepted, and
FR-8.1 already records that the contributor wrote the words _and_ the author let
them in. Keeping the name would fail an erasure request outright.

Two consequences follow that are worth stating plainly, because they are the
part a contributor should be told before they ask:

- **Erasure is not deletion of the writing.** The paragraphs stay in somebody
  else's novel. The interface says so at the point of asking.
- **Erasure is not reversible.** The link is gone, not hidden.

`Revision.authorId` becomes nullable to allow this, which is a schema change and
a deviation from `02-architecture.md` section 3. The alternative — a shared
"former contributor" user row — was rejected: it would make a foreign key point
at a fiction, and every query joining an author would have to know about it.

## Consequences

- One migration: `Revision.authorId` nullable, `Credit.erasedAt`, and the
  contributor link nullable.
- Every surface that renders an author or a contributor has to handle absence.
  That is the cost, and it is mechanical.
- Spin-off inheritance (FR-9.5) copies credits, so an erasure has to reach the
  inherited copies too. `inheritedFromId` already links them.
- FR-9.2's contributors strip counts erased credits as "a former contributor"
  rather than dropping the row, so an author's history does not silently gain a
  gap where a person used to be.
- Account deletion is the same operation applied to every credit at once, which
  is convenient: phase 6 gets it nearly free.
