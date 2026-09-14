# 0005 — Toolchain versions

Date: 2026-09-12 · Status: accepted

## Context

`02-architecture.md` §1 was written against Next.js 15, TipTap 2, Prisma 7,
tRPC 11 and Zod. By September 2026 the registry looks different, and a
foundation pinned to last year's majors would be dated on day one. At the same
time, a handful of brand-new majors are not yet worth the risk.

## Decision

Pinned exactly (pnpm catalog in `pnpm-workspace.yaml`):

| Package                                      | Version       | Note                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| next                                         | 16.3.5        | Turbopack by default, `proxy.ts` replaces `middleware.ts`, async request APIs only, `next lint` removed (ESLint runs directly), `typedRoutes` stable.                                                                                   |
| react / react-dom                            | 19.3.0        |                                                                                                                                                                                                                                         |
| typescript                                   | 5.9.3         | **Not 7.x.** TypeScript 7 is the Go-based compiler; typescript-eslint 8 declares `<6.1` and other tooling has not caught up. Revisit when typescript-eslint supports it.                                                                |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0        | Prisma 8 is a release candidate. Prisma 7 means `prisma.config.ts`, the `prisma-client` generator with a required `output`, and a driver adapter (`pg`) instead of the Rust engine.                                                     |
| @trpc/*                                      | 11.18.0       | Using `@trpc/tanstack-react-query`, the current integration, instead of `@trpc/react-query`.                                                                                                                                            |
| @tanstack/react-query                        | 5.102.8       |                                                                                                                                                                                                                                         |
| zod                                          | 4.6.2         | Zod 4 API (`z.email()`, `z.flattenError()`).                                                                                                                                                                                            |
| next-auth                                    | 5.0.0-beta.32 | Auth.js v5 is still tagged beta but declares Next 16 support and is the version the architecture intends.                                                                                                                               |
| tailwindcss / @tailwindcss/postcss           | 4.3.3         | CSS-first configuration; tokens live in `packages/ui/src/styles/globals.css`.                                                                                                                                                           |
| vitest                                       | 4.1.11        | **Not 5.x.** Vitest 5.0 shipped nine days before this decision; wait for the plugin ecosystem.                                                                                                                                          |
| eslint                                       | 9.39.5        | **Not 10.x.** `eslint-config-next` depends on `eslint-plugin-react` 7.37, which crashes under ESLint 10 (`context.getFilename` was removed). Flat config only, `defineConfig` from `eslint/config`. Move to 10 when Next's config does. |
| turbo                                        | 2.10.12       | Strict environment mode: every variable a task needs is declared in `turbo.json`.                                                                                                                                                       |
| @tiptap/*                                    | 3.x (Phase 1) | TipTap 3 replaced 2; the restricted schema is unaffected.                                                                                                                                                                               |
| diff                                         | 9.x (Phase 2) | `diffWordsWithSpace` still exists.                                                                                                                                                                                                      |
| nanoid                                       | 6.0.1         | ESM only, fine in this repository.                                                                                                                                                                                                      |

Renovation policy: Dependabot groups minor and patch updates weekly; majors
are reviewed by hand and, when they change a decision here, get a new record.

## Consequences

- The build plan's phase descriptions remain valid; only version numbers and
  the `middleware` → `proxy` rename differ.
- Anyone reading `02-architecture.md` §1 should treat this file as the
  current pin list.
