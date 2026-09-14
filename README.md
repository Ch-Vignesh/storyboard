# Storyboard

An open-source platform where a writer posts a draft they are stuck on, other
writers propose prose for the stuck passage, the author accepts one into the
main draft with permanent credit, and anyone who disagrees can spin the story
off into their own version.

> **Status: pre-alpha, phase 0 of 8.** Nothing is deployed. See
> [`docs/04-phase-plan.md`](docs/04-phase-plan.md) for where the build is.
>
> **Name:** _Storyboard_ is a working name. The domain is taken and the word is
> crowded in film and animation; a rename is planned (open decision OD-1) and
> will be a find-and-replace on the string, never on the concepts.

## What makes it different

- **No AI anywhere in the writing path.** No generated prose, no summaries, no
  chapter detection, no moderation scoring. The value is that a human helped.
- **The interface never speaks git.** Writers see drafts, versions,
  suggestions and spin-offs. A lint rule fails the build on the banned words.
- **Credit is permanent.** Every accepted contribution creates a durable,
  addressable record that survives edits, restores and spin-offs.
- **Honest about risk.** Public means copyable. Timestamped, content-hashed
  revisions are the defence that actually works, and the product says so.

The full specification is in [`docs/01-srs.md`](docs/01-srs.md); the
architecture in [`docs/02-architecture.md`](docs/02-architecture.md).

## Stack

Next.js 16 (App Router) · TypeScript · tRPC 11 · Zod 4 · Prisma 7 + PostgreSQL 16 ·
Auth.js 5 · Tailwind 4 + shadcn-style components · Vitest · Turborepo + pnpm.

## Getting started

Prerequisites: Node 24 (`.node-version`), pnpm 10 or newer, and PostgreSQL 16
(Docker is the easy way; a [Neon](https://neon.tech) database works unchanged).
Install pnpm with `corepack enable pnpm`, or with
`npm i -g pnpm --allow-scripts=pnpm` (npm 11+ blocks the install script that
sets up its launcher otherwise, and Turborepo then cannot spawn `pnpm`).

```bash
git clone <this repository> storyboard && cd storyboard
pnpm install                       # also generates the Prisma client
cp .env.example .env               # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d               # local Postgres on :5432
pnpm db:migrate                    # apply migrations (creates the schema)
pnpm db:seed                       # reference data (genres)
pnpm dev                           # app on :3000, marketing site on :3001
```

Without `RESEND_API_KEY`, emails (including the sign-up confirmation link) are
printed to the terminal running `pnpm dev`.

### Everyday commands

| Command                 | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `pnpm dev`              | Both apps in watch mode                                |
| `pnpm test`             | Vitest across every workspace, then the tooling tests  |
| `pnpm lint`             | ESLint (type-aware) across every workspace             |
| `pnpm typecheck`        | `tsc` across every workspace                           |
| `pnpm check-vocabulary` | Fails on git vocabulary in user-facing text            |
| `pnpm format`           | Prettier                                               |
| `pnpm build`            | Production builds                                      |
| `pnpm db:migrate`       | Create and apply a dev migration after a schema change |
| `pnpm db:deploy`        | Apply committed migrations (CI, production)            |
| `pnpm db:studio`        | Browse the database                                    |

Database integration tests (the revision-immutability trigger and the partial
unique indexes) run only when `DATABASE_URL` is set; CI always runs them
against a Postgres service container.

## Repository layout

```
apps/app          the application         app.<domain>
apps/web          the marketing site      <domain>
packages/db       Prisma schema, migrations, seeds, shared client
packages/ui       design tokens (Tailwind theme) and shared components
packages/config   tsconfig, ESLint and env presets shared by every workspace
scripts/          repository tooling (vocabulary linter)
docs/             spec, architecture, build plan, phase plan, decisions, prototype
```

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues labelled `good first issue`
are scoped to be finished in an evening. Every pull request cites the
requirement it implements (`FR-6.4`, `NFR-3`) and runs the same checks as CI.

Two things are non-negotiable and enforced by tooling: user-facing text never
uses git vocabulary, and no code path calls a language model.

## Licence

[AGPL-3.0-only](LICENSE). The code is open so that writers being asked to trust
it with unpublished work can see what it does, and so that hosted variants
stay open. The writing on the platform belongs to its authors; the product
makes no claim on it (docs/01-srs.md, FR-14.4).
