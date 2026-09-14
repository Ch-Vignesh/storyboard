# Storyboard — documentation set

Working name: **Storyboard**. Check availability before committing — the word is crowded in film/animation. Everything below uses it as a placeholder; a rename is a find-and-replace on the string, never on the concepts.

## What this is

An open-source platform where a writer posts a draft they are stuck on, other writers propose prose for the stuck passage, the author accepts one into the main draft with permanent credit, and anyone who disagrees can spin the story off into their own version.

## The documents

| File                 | What it holds                                                                                                                                  | Who reads it                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `01-srs.md`          | Product spec. Vocabulary, roles, numbered functional requirements FR-1 … FR-15, screen inventory, non-functional requirements, open decisions. | You, before every feature.                  |
| `02-architecture.md` | Data model, revision/branch strategy, diff engine, import engine, tRPC API surface, stack, environment.                                        | You, constantly.                            |
| `03-build-plan.md`   | Phases 0–7 with exit criteria. Each phase cites the FR numbers it satisfies.                                                                   | You, one phase at a time.                   |
| `prototype.html`     | Clickable visual prototype of six screens. Static, no backend.                                                                                 | You, to react to, and as the visual target. |

## How to use these documents

These four files live in `/docs` at the repository root. The working rules they imply:

Read `01-srs.md` and `02-architecture.md` before writing code. Work one phase at a time from `03-build-plan.md`; `04-phase-plan.md` tracks where that work actually stands. Do not start a phase until the previous phase's exit criteria pass.

- Cite the requirement you are implementing in the pull request body, e.g. `FR-6.4`.
- The UI never uses the words branch, merge, commit, fork, pull request, diff, or repository. See the vocabulary table in `01-srs.md` §2. A lint rule enforces this — see `scripts/check-vocabulary.ts`.
- No AI model calls anywhere in the product. Not for chapter detection, not for summaries, not for moderation. This is a product decision, not a cost one. See `01-srs.md` §1.3.
- Every schema change ships with a migration and a seed update.

## The one-paragraph version of the architecture

Postgres, one Prisma schema. A **storyboard** owns **versions** (the git branch, renamed); each version owns a copied tree of **chapters** and **sections**; each section points at its current **revision**, and revisions form an append-only parent chain so history and revert are free. Contribution requests hang off a section; suggestions hang off a request and carry a candidate revision. Accepting a suggestion writes a new revision and a permanent credit row. Copying the tree on version-create is deliberate — it costs storage and buys trivially simple queries.
