# 0044 — Publishing: a read-only edition of a story

**Date:** 2026-10-18
**Status:** proposed, at the owner's request; built as milestone 7b of `06-completion-plan.md`
**Extends:** FR-14 (publishing and export), FR-10.3 to FR-10.6 (spin-offs), decision 0014 (shared revisions)

## Why

A public story is read live: every save, every accepted suggestion, as it
lands. The only still page is a story marked finished (FR-14.1), which is
also the end of asking for help. Answering D-2 on 2026-10-18, the owner asked
for something between the two: a _published_ edition, like deploying a
release of a project. Readers get the edition; the workshop keeps moving
behind it; publishing again replaces the edition. And when a spin-off is
published, the story it came from is told and credited.

## The decision

**An edition is a frozen version.** Publishing copies the main draft's
chapter and section tree into a new `Version` with `frozenAt` set, sharing
its revisions as every version does (decision 0014), so an edition costs
rows, not prose. `Publication { id, storyboardId, number, versionId,
publishedById, publishedAt, note }` records it, and
`Storyboard.currentPublicationId` names the latest. Every write path refuses
a frozen version through `loadVersion`, so an edition can never change; it
can only be succeeded.

**Where it is read.** `/s/{slug}/published` is the current edition and
`/s/{slug}/published/{number}` any earlier one, each a clean reading page in
the manner of FR-14.1: no margin, no request cards, the contributors linked
from the foot. The reader at `/s/{slug}` stays the working draft, because the
working draft is where help happens (FR-11.5) and where a visitor reads a
stuck passage within sixty seconds (FR-1.1); it shows "Published edition 3,
18 October" with a link whenever one exists. Browse cards and profiles mark
a published story. Exports take the current edition when there is one, and
the export page lets the author choose the working draft instead.

**Publishing again.** The next number; earlier editions stay readable and are
listed on the Versions page under "Published editions". There is no
unpublishing: an edition strangers have read cannot be unread. A story made
private takes its editions with it, as it takes everything (FR-2.7).

**A spin-off's publication.** It tells the original's authors with a new
notification type, `SPIN_OFF_PUBLISHED`, hourly, and the edition's front
matter names the original and its author, as exports already do. Publishing
outside Draftboard is unchanged: an author's own work is theirs to publish
anywhere (FR-14.4); a spin-off carries other people's prose and needs their
permission (D-2), which the terms say and the product cannot enforce. The
owner named the gap: somebody can copy and publish without telling anyone.
That is FR-13.6's honesty, and the timestamped editions are part of the
answer to it, as the revisions already are.

## Consequences

A publication is a socially significant event (NFR-7). Five items in
milestone 7b, after the reader work of milestone 7 that the edition page
reuses. The terms' paragraph on publishing (item 2.2) is written against this
record and finished when 7b lands.
