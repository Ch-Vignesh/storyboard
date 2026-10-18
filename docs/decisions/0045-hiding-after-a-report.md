# 0045 — Hiding what moderation upholds

**Date:** 2026-10-18
**Status:** accepted; built as item 2.7 of `06-completion-plan.md`
**Amends:** FR-13.5 and FR-13.7 (what upholding a report does). FR-9.1 stands:
nothing is deleted, because credit is permanent.

## Why

Upholding a report changed only the report. An upheld abusive idea, a
suggestion made of somebody else's words, or a story of copied work stayed
exactly where it was, readable by everyone. The only lever was suspending the
account, which punishes the person and leaves the thing.

## The decision

**Three columns, three tables.** `hiddenAt`, `hiddenById` and `hiddenReason`
(the report's category) on `Idea`, `Suggestion` and `Storyboard`. Set by
"Uphold and hide" or "Hide it" on the report queue, cleared by "Show it
again". Behind `reports.decide` (decision 0043), so the administrator and the
sub-admins who hold it. Never a person: an account is suspended, not hidden.

**A hidden story.** `lib/authz` answers not found to everyone but its authors
and a moderator, where a moderator is an actor carrying `reports.decide`
(`actor.moderator`, set by `actorFrom` and by nothing a component can reach).
Its authors keep every permission they had; a moderator reads and writes
nothing. Browse, the sitemap, public profiles, the Sunday digest, the quiet
nudge, spin-off lists and the exports all follow the guard, through
`visibleStoryboardsWhere` or `PUBLICLY_LISTED`. The authors see a banner across
the story naming the reason and the contact address.

**A hidden idea or suggestion** stays in its thread, so the thread keeps its
shape, and reads "Removed after a report." to everyone but its writer and a
moderator; the comparison is not served to anyone else either. It is not an
answer (`ANSWERS`, `ideaAnswerWhere`, `TOP_LEVEL_IDEAS`), cannot be accepted or
marked as the idea that helped, and holds no place in its writer's quota.

**Nothing is deleted.** A credit already earned stays. An accepted
suggestion's revision stays in the story: hiding the suggestion hides the copy
on its own page, not the words in the manuscript, which are the author's to
edit or the story's to hide as a whole.

Each hide and show is logged with who did it, and becomes a stored event with
item 10.2. The writer is not told by a notification; they see it where they
wrote it.

## What this does not change

Suspension by ten upheld reports and what a suspension means (decision 0018);
what deleting an account means (decision 0024); the report categories.

## Consequences

A request whose only answer is hidden stays in the state it had reached;
nothing recomputes request states on a hide. The counts that follow
`ANSWERS` drop the hidden one at their next read. A third column on three
tables, where one `HiddenThing` table would have done: a join on every read
of a story, a suggestion and an idea was the price, and these reads are the
hot ones.
