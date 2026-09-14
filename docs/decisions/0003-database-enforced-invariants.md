# 0003 — Database-enforced invariants

Date: 2026-09-12 · Status: accepted

## Context

NFR-3 requires revisions to be append-only at the database level, enforced by
a trigger rather than application code. FR-2.6 and FR-8.2 also require that a
storyboard is hard-deleted 30 days after a soft delete, and that account
deletion removes prose. A trigger that refuses every `DELETE` makes both
impossible without disabling the trigger, which needs table-owner privileges
and is the kind of thing that gets left off.

Two further rules from the spec are cheap to hold in the database and
expensive to get wrong in code under concurrency: exactly one main version per
storyboard (FR-10.2) and at most one open request per section (FR-5.1).
`02-architecture.md` §3 writes the first as `@@unique([storyboardId, isMain])`,
which would also forbid a second _non-main_ version and is therefore wrong.

## Decision

1. `revision_immutable()` refuses `UPDATE` unconditionally. It refuses `DELETE`
   unless the current transaction has run
   `select set_config('storyboard.hard_delete', 'on', true)`. The third
   argument scopes the setting to the transaction, so it cannot leak into a
   pooled connection. Only the storyboard hard-delete job and account deletion
   may set it, inside the same transaction as the deletes.
2. Partial unique indexes, created in `20260912000100_invariants`:
   `one_main_per_storyboard` on `Version(storyboardId) where isMain`, and
   `one_open_request_per_section` on `ContributionRequest(sectionId) where
state in ('OPEN','ANSWERED')`. Prisma's schema does not model partial
   indexes; the Prisma model carries a plain `@@index([storyboardId])` and a
   comment pointing here.
3. `packages/db/src/__tests__/invariants.test.ts` proves all three against a
   real database. It skips when `DATABASE_URL` is unset and always runs in CI.

4. The trigger raises with the default SQLSTATE `P0001`. Prisma folds
   integrity-class codes such as `restrict_violation` into its generic
   constraint errors and drops the message; `P0001` is passed through, so
   callers and tests see "Revision rows are immutable (NFR-3)".

## Consequences

- Application code that wants to delete a revision outside the two sanctioned
  jobs fails loudly with the NFR-3 message, which is the point.
- Prisma reports the partial-index violations as `P2002`; the tests assert on
  the code rather than the message.
- `prisma migrate dev` will not detect drift in these objects because Prisma
  does not model them. Changing them means a new hand-written migration.
