# 0019 — A spin-off owns its revisions

**Date:** 2026-09-15
**Status:** accepted
**Found by:** the phase 6 audit, proved by `apps/app/src/server/purge/purge.test.ts`

## The bug

`copyTree` shares revision rows rather than copying them — deliberately, per
architecture §2.2, because revisions are immutable and an alternate version of a
storyboard should not duplicate 700 KB of prose to say "unchanged so far".

Spin-offs used the same function. So a spin-off's sections pointed at the
**original storyboard's** revisions, across an ownership boundary.

`Section.currentRevisionId` is `ON DELETE SET NULL`. FR-2.6's purge deletes a
storyboard's revisions thirty days after its author deletes it. Put together:

> I spin off your storyboard. You delete yours. Thirty days later a cron job
> empties my manuscript — every section, silently, with no record of why.

FR-10.6 says an author cannot delete somebody else's spin-off. This let them do
worse: leave it standing and hollow.

## The decision

Sharing stays **inside** a storyboard and stops at its edge.

| Copy                                 | Revisions |
| ------------------------------------ | --------- |
| A new version of the same storyboard | shared    |
| A spin-off into a new storyboard     | copied    |

A copied revision keeps the things that are true of it: `contentJson`,
`contentText`, `wordCount`, `contentHash`, `source`, `authorId`, `acceptedById`
and `createdAt`. The same words, written by the same person, at the same
moment — and the same hash, so FR-13.6's proof still checks out against either
copy.

It drops the things that are not: `parentId` and `restoredFromId` (the chain
belongs to the original's history) and `suggestionId` (unique, and the
suggestion was sent to the original author, not to this one).

Inherited credits are remapped to the copies, so FR-9.5's credit still points at
a revision that exists.

## Why not fix it at the purge instead

The alternative was to make the purge keep any revision another storyboard still
points at. It was rejected for two reasons.

It leaves the coupling in place and merely defends one of its consequences. A
shared row across an ownership boundary would still mean the original's
lifecycle reaches into the spin-off — through account deletion, through a future
bulk operation, through anything written later by someone who does not know.

And it makes deletion a lie. An author who deletes a storyboard, waits out the
grace period, and is told it is gone would still have their prose on the server,
readable inside somebody else's spin-off.

## What it costs

Storage, once per spin-off: roughly 700 KB for a 120,000-word novel, which is
the same arithmetic architecture §2.1 already accepts for versions. Nothing is
copied on read, and nothing is copied again when the spin-off is written in.

## The scar

The failing test came first and stays: "leaves a spin-off with its prose when
the original is purged". It is the only test in the file that is about somebody
other than the person who acted.

Related: [[0014-a-head-revision-can-be-shared]], which introduced sharing and is
still right about the case it was written for.
