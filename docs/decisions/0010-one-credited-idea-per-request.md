# 0010 — One credited idea per request

Date: 2026-09-14 · Status: accepted · Resolves: OD-5

## Context

`01-srs.md` section 9 leaves OD-5 open and it blocks phase 2. FR-6.9 lets an
author mark one idea on an `unblock` request as having helped, which creates a
`Credit` of type `idea`. The alternative is to let them mark any number.

The argument for unlimited is real: three people may each contribute part of
the answer, and forcing a single choice makes the author pick a favourite among
people who all helped.

## Decision

One per request, as FR-6.9 is written.

The reason is principle 1.3.5, scarcity over volume. The product already limits
a contributor to three open suggestions per storyboard because it "optimises for
considered help, not throughput". A credit that can be handed to everyone stops
being a signal and becomes politeness — and an author who feels obliged to mark
every idea is doing social admin, not writing.

Marking is optional. An author who cannot choose marks nothing, which is a
supported state with no penalty (principle 1.3.4).

Enforced by a partial unique index, `one_helpful_idea_per_request`, in the
migration of the same name — not only in the router. Two co-authors deciding at
the same moment would both pass an application check, and only the database can
refuse the second write. This is the same shape as `one_main_per_storyboard` and
`one_open_request_per_section`.

## Consequences

- Marking a second idea fails with a plain sentence rather than silently
  creating a second credit.
- Un-marking is not built. Nothing in the SRS asks for it, and a credit that can
  be withdrawn is a different and much larger question — it is adjacent to OD-3
  (a contributor's right to be forgotten), which blocks phase 4 and should
  settle both.
- If real use shows authors routinely wanting to credit two people, this is a
  one-line index drop and a router change. Going the other way — withdrawing
  credits already granted — would not be.
