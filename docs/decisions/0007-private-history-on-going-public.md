# 0007 — Private history stays private when a storyboard goes public

Date: 2026-09-14 · Status: accepted · Resolves: OD-4

## Context

`01-srs.md` section 9 leaves OD-4 open and it blocks phase 1: when a private
storyboard is switched to public, do the revisions written while it was private
become readable?

FR-2.7 as written says no — history is exposed from the switch point forward.
The alternative, exposing everything, is simpler, needs no column, and is more
consistent with the "every revision is timestamped and traceable" line in
FR-13.6.

## Decision

Keep FR-2.7 as written. `Storyboard.publicFrom` stays in the schema, and a
reader sees only revisions created at or after it. Owners and co-authors always
see the whole chain.

The rule lives in `lib/authz` in two forms that must agree:

- `canReadRevisionAt(actor, storyboard, createdAt)` for a single revision.
- `revisionVisibilityWhere(actor, storyboard)` as a Prisma fragment, so a
  history list filters in the database instead of fetching everything and
  discarding rows.

`publicFrom` means "the first instant this storyboard was public" and is
therefore written once and never cleared:

| Transition                     | `publicFrom`                       |
| ------------------------------ | ---------------------------------- |
| Created public                 | set to now                         |
| Created private                | null                               |
| Private → public               | set to now if still null           |
| Public → private               | left alone                         |
| Private → public a second time | left alone — that history was seen |

Leaving it alone on the way back to private is deliberate. Once a revision has
been publicly readable it cannot be unseen, and pretending otherwise would be
the kind of protection the product promises not to imply (FR-13.6).

A null `publicFrom` on a public storyboard is impossible by construction, so
both functions treat it as "show nothing" rather than "show everything". If the
invariant is ever broken by a bug, an empty history panel is a visible symptom;
a leaked private draft is a silent one.

## Consequences

- No migration. The column was already in the phase 0 schema for exactly this.
- A writer can draft in private and open the work up without publishing the
  drafting process, which is the behaviour the requirement was protecting.
- Someone reading a public storyboard may see a section whose history begins
  mid-chain. The history panel says so plainly rather than implying the section
  appeared from nowhere.
- `storyboard.create` and `storyboard.setVisibility` are both responsible for
  stamping `publicFrom`; the rule is in one place in the router, tested.
