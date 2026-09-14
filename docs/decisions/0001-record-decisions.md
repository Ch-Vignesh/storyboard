# 0001 — Record decisions that deviate from the architecture

Date: 2026-09-12 · Status: accepted

## Context

`02-architecture.md` is the reference design. Reality will diverge from it:
libraries move, a model turns out to need one more column, a documented
constraint turns out to be wrong. If those divergences live only in commit
messages, the next person (or the same person in six months) rebuilds the
reasoning from scratch or, worse, "fixes" the code back to the document.

## Decision

Every deliberate deviation from `02-architecture.md`, and every choice with
long-lived consequences that the document does not cover, gets a short file in
this directory. Numbered, one decision per file, never edited after acceptance
except to mark it superseded by a later one.

Template:

```md
# NNNN — Title

Date: YYYY-MM-DD · Status: proposed | accepted | superseded by NNNN

## Context

What forced a choice. One or two paragraphs.

## Decision

What was chosen. Plain statements.

## Consequences

What becomes easier, what becomes harder, what to watch.
```

## Consequences

`docs/04-phase-plan.md` links the decisions relevant to each phase. Reviewers
can ask "where is the decision record?" when a pull request changes a
load-bearing shape without one.
