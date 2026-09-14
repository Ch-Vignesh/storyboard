# 0006 — One `.env` at the repository root

Date: 2026-09-12 · Status: accepted

## Context

Next.js reads `.env` from the app directory, Prisma reads it from the package
directory, and Vitest reads nothing unless told. Turborepo's documentation
recommends a `.env` per app. For one developer running two apps and a
database package, three copies of `DATABASE_URL` is how a Friday evening is
lost.

## Decision

There is exactly one `.env`, at the repository root, documented by
`.env.example`. `@storyboard/config/env` exports `loadRootEnv()`, which finds
that file relative to its own location and loads it without overwriting
variables already present. It is called at the top of every `next.config.ts`,
`prisma.config.ts`, `vitest.config.ts` and the seed script.

Hosted environments (Vercel, CI) set variables directly; `loadRootEnv()` is a
no-op when the file is absent.

`turbo.json` declares every variable in `globalEnv` so Turborepo's strict
environment mode passes them through and includes them in cache keys, and
lists `.env` in `globalDependencies` so editing it invalidates builds.

`apps/app/src/env.ts` validates the variables with Zod at startup and is
imported from `next.config.ts` so a production build fails on a missing or
malformed value rather than the first request.

## Consequences

- One place to configure; one file to keep out of git.
- If the two apps ever need conflicting values for the same name, that is the
  moment to split the file, not before.
