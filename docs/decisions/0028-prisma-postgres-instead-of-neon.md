# 0028 — Prisma Postgres instead of Neon

**Date:** 2026-10-13
**Status:** accepted
**Deviates from:** `02-architecture.md` §1, which names Vercel + Neon for
hosting, and the Neon steps in `05-deployment.md`

## What changed

The production database is Prisma Postgres, created through Vercel's storage
integration rather than as a Neon project. To the application it is still
Postgres reached over node-postgres through `@prisma/adapter-pg`, so no query,
migration or schema changes. What changed is configuration, documentation, and
the guardrails below.

## The two connection strings map onto the two variables that already existed

Prisma Postgres has the same shape as Neon: one set of credentials, two hosts.

| Host                  | What it is                          | Goes in               |
| --------------------- | ----------------------------------- | --------------------- |
| `pooled.db.prisma.io` | PgBouncer, transaction-mode pool    | `DATABASE_URL`        |
| `db.prisma.io`        | Direct; advisory locks and DDL work | `DIRECT_DATABASE_URL` |

The application was already built for a transaction-mode pooler, because
Neon's is one. Checked again against this one: the adapter sends unnamed
statements (it only names them when given a `statementNameGenerator`, and none
is), the two `set_config` calls are transaction-local and run inside
interactive transactions, no migration creates an extension, and the triggers
are plain `plpgsql`. Prisma's own documentation says migrations over the
pooled host fail on locks, which is the failure `DIRECT_DATABASE_URL` exists to
prevent.

Prisma also issues `prisma+postgres://` URLs, for Prisma Accelerate, which
speaks HTTP and needs a client built without a driver adapter. This
application does not use it. This installation's integration did not offer
one — all three of its variables hold the same `db.prisma.io` string — but
older ones did, under a name that reads like the right answer. Both `createPrismaClient` and the
`DATABASE_URL` schema in `apps/app/src/env.ts` refuse anything that is not
`postgres://`, naming the reason.

## The Vercel variable names are not read

The integration names its variables with a prefix chosen when the database is
connected, for example `prisma_draftboard_POSTGRES_URL`. The application keeps
reading `DATABASE_URL`. A prefix belongs to one installation; hard-coding one
into a public repository would make every other installation wrong.

So `DATABASE_URL` is added to the Vercel project by hand, holding the pooled
string. The consequence worth knowing: if the credentials are rotated in Prisma,
the integration updates its own variables and this one goes stale. Rotate it
by hand at the same time.

## What is lost against Neon

**Point-in-time restore, and possibly every backup (NFR-8).** Neon's 30-day
point-in-time restore was where the NFR-8 claim came from. Prisma Postgres
takes a snapshot once a day, and only on days the database had activity, with
no point-in-time restore. Retention depends on the plan:

| Plan     | Snapshots kept |
| -------- | -------------- |
| Free     | none           |
| Starter  | 7 days         |
| Pro      | 7 days         |
| Business | 30 days        |

NFR-8 asks for "daily automated Postgres backup with 30-day retention before
the first real user". On this provider only Business meets that outright. On
Starter or Pro, it needs a `pg_dump` kept for 30 days alongside the snapshots,
and on Free there is no backup at all. Whichever it is, the restore drill
(`pnpm db:drill`) is still the test: it runs against any database restored from
a backup, snapshot or dump. Prisma Postgres is based on Postgres 17, so a
`pg_dump` needs version 17 client tools.

**Preview databases.** Prisma Postgres has nothing like a Neon branch. A preview
deployment either shares the production database, if `DATABASE_URL` is set for
the Preview environment, or fails its build because the variable is missing.
Set it for Production only until there is a second database for previews.

**Connection headroom.** The pooled host allows 10 concurrent connections on
Free, 100 on Starter and 500 on Pro. node-postgres opens up to 10 per
function instance. That is fine at launch traffic, and the first place to look
if "too many connections" ever appears. It is not tuned now: tuning without
traffic would be guessing.

**Region, now that it matters more.** The application keeps Prisma's 5 s
interactive-transaction limit. Next to the database a statement takes a
millisecond or two. From a laptop on another continent it took about 300 ms,
and the seed's first live run failed on exactly that limit. The fix there was
to give the seed longer, because it is a batch job. The fix for the
application is to run its functions in the database's region.

**Postgres 16.** The architecture names 16; Prisma Postgres runs 17. No
migration uses anything that differs between them, and CI still tests on 16.

## Guardrails, because `.env` now names the live database

On a laptop with no Postgres of its own, the hosted database is the one in
`.env`. Several commands assumed that file pointed at a disposable local
database, and each would have written to production:

- **`pnpm test`.** The database suites create accounts and storyboards, and two
  run the purge. A test run now treats a `DATABASE_URL` that is not on this
  machine as unset, and those suites skip themselves as they do on a clone with
  no `.env` (`keepTestsOffHostedDatabases` in `packages/config/env.js`). Four of
  the application's suites used to fail on import instead of skipping, because
  importing `@/env` threw on the missing URL. They now skip.
- **`pnpm e2e`.** It signs up accounts. A local run refuses a hosted
  `DATABASE_URL` outright. A run against a deployment, with
  `PLAYWRIGHT_BASE_URL` set, is unchanged, because that is a deliberate act
  (phase 8).
- **`prisma migrate dev`, `migrate reset` and `db push`.** All three can drop
  every table, and `migrate dev` offers to whenever it finds drift.
  `prisma.config.ts` refuses them against a hosted database unless
  `ALLOW_REMOTE_SCHEMA_RESET=yes-really` is set. A hosted database gets
  `pnpm db:deploy`, which only ever applies.

To run any of these, name a local database for that one command:
`DATABASE_URL=postgresql://…@localhost:5432/storyboard pnpm test`. A local
`DATABASE_URL` now wins over a `DIRECT_DATABASE_URL` from `.env` in
`prisma.config.ts`, so that one variable is enough.

`prisma.config.ts` also had a latent bug that this exposed: it fell back from
`DIRECT_DATABASE_URL` with `??`, and `.env.example` ships that variable as `""`.
So a fresh copy of the example file could not run a single migration. Empty
now counts as unset there, as it already did in the application's env schema.

## Reversing it

Back to Neon, or any Postgres, is two variables: its pooled string in
`DATABASE_URL` and its direct one in `DIRECT_DATABASE_URL`. Nothing in the code
names the provider.

Checked against Prisma's documentation on 2026-10-13: connection pooling,
direct connections, and backups (prisma.io/docs/postgres). Those pages have
changed before; check the limits and retention again before relying on them.
