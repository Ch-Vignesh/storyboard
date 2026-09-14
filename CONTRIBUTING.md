# Contributing to Storyboard

Thank you for helping. This page is short on purpose; the product thinking
lives in `docs/`, and the rules that matter most are enforced by tooling.

## Before you start

1. Read `docs/01-srs.md` sections 1 to 3 (fifteen minutes). It explains what
   the product is, the vocabulary it uses, and the six principles that count
   as bugs when violated.
2. Check `docs/04-phase-plan.md` to see which phase is in progress. Work that
   belongs to a later phase will be parked, however good it is, because the
   phases exist for dependency reasons.
3. Pick an issue. `good first issue` means it can be finished in an evening and
   touches one place. Comment on it so nobody duplicates the work.

## Setting up

Follow the _Getting started_ section of the README. You need Node 24, pnpm and
a PostgreSQL 16 database (Docker Compose is provided). `pnpm install` generates
the Prisma client; `pnpm db:migrate` creates the schema.

## Making a change

- **One requirement per pull request.** Name it in the description
  (`FR-6.4`, `NFR-3`, `OD-2`). If a change has no requirement, open an issue
  first so we can decide whether it should.
- **Schema changes** ship with a migration (`pnpm db:migrate` writes it) and,
  where relevant, a seed update. Invariants Prisma cannot express (triggers,
  partial unique indexes) go in a migration with a comment naming the
  requirement. Never use `prisma db push`.
- **Bounds and limits** (word counts, quotas, rate limits) live only in
  `apps/app/src/lib/schemas/constants.ts`. Import them.
- **Permissions** are decided at the data layer through `lib/authz` (from
  phase 1). Components read a `permissions` object the server computed; they
  never decide.
- **User-facing text** follows the vocabulary table in `docs/01-srs.md`
  section 2. `pnpm check-vocabulary` fails on banned words. Sentence case.
  A button names its consequence ("Accept into main draft", not "Submit").
- **No AI.** No model calls, no embeddings, no "smart" anything in the writing
  path. This is principle 1.3.1 and it is not open for discussion in v1.
- **Deviating from `docs/02-architecture.md`** is fine when there is a reason;
  record it in `docs/decisions/` using the template there.

## Checks

Run what CI runs before pushing:

```bash
pnpm format:check && pnpm check-vocabulary && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

A pre-commit hook formats staged files. Tests live next to the code as
`*.test.ts`. Pure logic (the comparison engine, the import pipeline, the
permission matrix) is unit-tested exhaustively; the six critical user flows
are covered by Playwright from phase 2.

## Commit messages and pull requests

- Imperative subject line under 72 characters, e.g.
  `Add staleness check to suggestion.accept (FR-6.7)`.
- The pull request template asks for the requirement and a short checklist.
  Fill it in; reviewers rely on it.
- Keep pull requests small. A reviewer should be able to hold the whole
  change in their head.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Writers
are trusting this community with unfinished work; behave accordingly.

## Licence

By contributing you agree that your contributions are licensed under the
[AGPL-3.0-only](LICENSE), the same as the rest of the project.
