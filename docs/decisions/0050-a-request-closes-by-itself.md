# 0050 — A request closes by itself after thirty days

**Date:** 2026-10-18
**Status:** accepted (D-8, owner 2026-10-18); built by phase 14, item 6.15
**Amends:** `01-srs.md` principle 1.3.4 ("the author is never cornered") for
this one case; FR-11.3's "Waiting longest" sort stays as it is

## Why

Principle 1.3.4 says an author may reject everything, accept nothing, or walk
away for a month without penalty, and the product has kept to that: nothing
ever closed a request on its own. The cost fell on the other side. A helper
who found a passage under "Waiting longest" could write for an evening for an
author who had walked away in the spring, and browse filled with requests
nobody was coming back to decide on.

The owner's answer to D-8 was neither a "closing soon" sort nor leaving things
as they were: a request closes by itself thirty days after it is opened, and
its page and cards say so from the day it opens, so nobody is surprised by it,
least of all the author.

## Decision

- `REQUEST_OPEN_DAYS` is 30. A request's page and every card of it say
  "Closes on {date}" from the day it opens, in the reader's time zone (item
  1.18).
- `ContributionRequest.openedAt` is the clock: set when the request is
  opened, and set again when an author opens a closed request again, which
  starts a fresh thirty days. A resolved request is left alone: it has had its
  answer, and resolving is the author's act.
- A nightly job, beside the purges, closes every request still open or
  answered past its day, through the same function the author's own close
  uses. The people answering it are told as that close tells them (FR-5.10:
  what they sent stays readable and on their profile), and the author is told
  once per request, by a notification of its own kind, so they can open it
  again if they still want help.
- Browse keeps "Waiting longest". With a horizon of thirty days the sort is
  honest again: the longest wait it can show is a month.
- The rows that were already open longer than thirty days when this shipped
  close on the first nightly run after it, with their authors told. The
  column was backfilled from `createdAt`, so nothing started its clock from
  the day of deployment.

## Consequences

- Principle 1.3.4 now reads with one exception: an author may still reject
  everything and accept nothing, and may still walk away, but a request they
  walk away from closes after a month, and says in advance that it will. They
  lose nothing by it: opening it again is one click and starts the month over.
- A helper never writes for a request whose author left more than a month
  ago, and never for one that is about to close without knowing it.
- The seventeen notification types (FR-12.2) gain one: `REQUEST_AUTO_CLOSED`,
  batched hourly, with email that can be turned off like the rest.
