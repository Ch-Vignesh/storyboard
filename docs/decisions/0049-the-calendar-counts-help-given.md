# 0049 — The contribution calendar counts help given

**Date:** 2026-10-18
**Status:** accepted (D-6, owner 2026-10-18); built by phase 14, item 6.13
**Amends:** `02-architecture.md`'s note that `ActivityDay` is written "on the
events that represent work"; FR-9.3's calendar now has a definition

## Why

The calendar on a profile was written on every event that looked like work:
a version saved, a request opened, a suggestion sent, an idea posted, a
decision made. So an author filled their own grid by writing their own book,
and the grid said nothing a reader could use. The prototype's heading is
"Days she wrote something for someone", and that is the question a visitor
has: does this person help?

The owner's answer to D-6 is that a day is marked when a suggestion or an
idea is sent to somebody else's story, whether or not it is later accepted.
Sending is the work; acceptance is the author's. A decision on someone
else's writing is not help given, and a save of one's own is not either.

## Decision

- `ActivityDay` counts, per person per day, the suggestions they sent and the
  top-level ideas they posted on stories they do not write. A reply under an
  idea is a conversation, not help offered, and does not count. Nothing else
  writes to the table.
- The day is the sender's own: the zone the browser sends with every call
  (item 1.18's `x-time-zone` header) decides which date a late evening falls
  on. The profile's year ends on the day it is where the reader is.
- The rows were rebuilt once, by migration `20261018050000_calendar_counts_help`,
  from the suggestions and ideas themselves, with the same rule. The rebuilt
  days are UTC days, because the zone a thing was sent from was not recorded
  before this item; from the item on, the days are the senders' own. A row
  near midnight from before 2026-10-18 may therefore sit one day off from
  how its sender remembers it. Nothing corrects that later, because nothing
  can.
- "Not a story they write" is read at the time of the send (the owner and
  the accepted co-authors then). The rebuild read it as things stand on the
  day it ran, which is the best record there is.

## Consequences

- An author's profile shows the help they gave others, and only that. A
  person who only writes their own stories has an empty calendar, and the
  sentence under the heading says so plainly.
- The counters on a profile (contributions accepted, ideas that helped) are
  unchanged: they count acceptance, which is the author's, where the
  calendar counts the sending, which is the helper's.
- `recordActivity` has two call sites, both after their transaction: the
  suggestion's send and the idea's post. Anything new that counts as help
  given goes through the same function with the sender's zone.
