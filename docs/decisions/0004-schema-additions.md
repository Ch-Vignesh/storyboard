# 0004 — Schema additions beyond the architecture document

Date: 2026-09-12 · Status: accepted

## Context

`03-build-plan.md` asks for the Prisma schema in full during Phase 0 because
migrations are cheaper now than later. Writing every model against the
requirements surfaced fields the abbreviated schema in `02-architecture.md` §3
did not have.

## Decision

Added, each traceable to a requirement:

| Addition                                                                                   | Requirement                | Why                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SectionDraft` (per user, per section, overwritten in place)                               | FR-4.4, FR-4.5             | The 3-second autosave target. Revisions are durable and per version; drafts are volatile and per user. Helper drafts of suggestions are `Suggestion` rows in `DRAFT` state, but the author's own autosave had nowhere to live. |
| `EmailVerificationToken`                                                                   | FR-1.4                     | See decision 0002.                                                                                                                                                                                                             |
| `NotificationPreference` (userId, type, email)                                             | FR-12.1                    | Per-type email toggles; in-app cannot be disabled so it has no column.                                                                                                                                                         |
| `Credit.inheritedFromId`                                                                   | FR-9.5                     | Credits are copied into a spin-off at the moment of the spin-off, consistent with copy-on-create everywhere else, and each copy points at its origin.                                                                          |
| `Storyboard.deletedAt`                                                                     | FR-2.6                     | The 30-day hard-delete job needs to know when the soft delete happened. `state = DELETED` alone cannot say.                                                                                                                    |
| `Storyboard.finishedAt`                                                                    | FR-14.1                    | When it was marked finished.                                                                                                                                                                                                   |
| `Storyboard.forkedFromVersionId`                                                           | FR-10.3, architecture §2.3 | The document's prose mentions it; the schema did not.                                                                                                                                                                          |
| `User.isAdmin`                                                                             | FR-15.5                    | Admin screens need a gate.                                                                                                                                                                                                     |
| `User.onboardedAt`, nullable `username` / `passwordHash` / `displayName`                   | FR-1.3                     | See decision 0002.                                                                                                                                                                                                             |
| `Collaborator.invitedById`                                                                 | FR-12.2                    | The invitation notification names who invited.                                                                                                                                                                                 |
| `ContributionRequest.closedAt`, `Suggestion.withdrawnAt`, `Report.resolvedById/resolvedAt` | FR-5.9, FR-6.5, FR-13.7    | Audit timestamps for states the spec distinguishes.                                                                                                                                                                            |
| `updatedAt` on mutable models                                                              | —                          | Ordinary hygiene.                                                                                                                                                                                                              |
| `Revision @@index([contentHash])`                                                          | FR-13.6                    | Proof-of-authorship lookups by hash.                                                                                                                                                                                           |

Removed: `Version @@unique([storyboardId, isMain])` (see decision 0003).

Renamed: `DiffCache.html` → `DiffCache.result`, since the comparison engine
returns rows, not HTML (architecture §4).

Referential actions: child rows of a storyboard, version, chapter or section
cascade on delete so the hard-delete job is one statement per storyboard.
`Revision.sectionId` deliberately does **not** cascade: the trigger must see
every revision delete. Optional relations default to `SetNull`.

## Consequences

- Phase 1 (editor, drafts), Phase 3 (preferences), Phase 4 (spin-offs) and
  Phase 6 (deletion) find their columns already in place.
- Anyone comparing the schema with `02-architecture.md` should read this file
  first; the document is not updated retroactively.
