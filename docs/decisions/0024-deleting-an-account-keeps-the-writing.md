# 0024 — Deleting an account keeps the writing

**Date:** 2026-09-15
**Status:** accepted
**Resolves:** OD-3's second half. Decision 0013 closed the first half — erasing
a single contribution record — and left "delete my whole account" open, which
is where phase 9 starts.

## The conflict

Three things pull against each other, and no answer satisfies all three.

- **GDPR Article 17.** A person can ask for their personal data to be erased,
  and "my name is on this paragraph forever" is personal data.
- **Principle 1.3.3 and FR-8.5.** A credit is permanent. The record of a
  contribution outlives the text of it.
- **Other people.** This is the one that decides it. A storyboard somebody owns
  is rarely only theirs: a contributor's accepted suggestion is inside it and a
  contributor's credit is on it. A co-author's chapter contains revisions this
  person wrote.

So "delete everything they own" is not a privacy maximalism that costs only
them. It reaches into other people's manuscripts and other people's credited
work, and it does so on the say-so of one person who is leaving.

## The decision

**The person is erased. The writing stays.**

| Thing                                                     | What happens                         |
| --------------------------------------------------------- | ------------------------------------ |
| Name, username, email, biography, picture, password       | destroyed                            |
| Notifications, email preferences, pinned genres, activity | destroyed                            |
| Unsaved drafts                                            | destroyed                            |
| Uploaded manuscript files, and the filenames              | destroyed, in object storage too     |
| Membership of other people's storyboards                  | removed                              |
| Storyboards they own                                      | **stay**, shown as "a former member" |
| Revisions they wrote                                      | **stay**, shown as "a former member" |
| Credits they hold on other people's work                  | **stay**                             |
| Reports they filed                                        | stay, no longer attached to a name   |

Seven days between the request and the erasure
(`ACCOUNT_DELETION_GRACE_DAYS`), during which the account is frozen: no
writing, no email, no profile, and a sign-in that exists so they can stop it.

## The row survives, and that is the design

There is no tombstone table and no cascade. The `User` row itself is kept, with
every identifying column destroyed.

This is the opposite of what "delete" usually implies, so: that row is the
anchor every revision, credit, suggestion, request and storyboard points at.
Deleting it would take other people's work with it. That is not hypothetical —
it is precisely the failure decision 0019 caught in spin-offs, where a shared
row crossing an ownership boundary meant one person's delete would silently
empty another person's manuscript.

Keeping the anchor also means no call site changes. `nameOf()` already renders
a person with no names as an absence rather than as missing data (decision
0013), and `hasProfile()` already refuses to link to one.

## Why seven days and not thirty

A storyboard gets thirty (FR-2.6) because it is a thing somebody may want back.
An account is a person asking to be gone, and making them wait a month to be
erased is the product arguing with them.

Seven is not a cooling-off courtesy. It is there because **an account somebody
else has got into can be destroyed in one click**, and a window in which the
real owner can sign in, see a banner, and stop it is what makes that
recoverable. That is also why the frozen state still permits signing in: an
undo nobody can reach is not an undo.

## Two words, not one

`nameOf()` gains a second string. An erased credit still reads "a former
contributor", which is right on a contributors page. A deleted account reads "a
former member", because the same words under a novel's title — "by a former
contributor" — say the wrong thing about somebody who wrote the whole book and
then left.

## What the interface must say before the button

The deletion screen states what is kept before it states what goes, and names
the reason: other people contributed to this work and were credited on it.
Somebody who would not have deleted had they known that must find out there
rather than afterwards, when there is nothing to be done.

Confirmation is typing the username. Not theatre — it is the cheapest thing
that cannot be done by a mis-click or a page that reloaded under somebody's
finger.

## Consequences, including the uncomfortable one

- A person can remove their name from the product and cannot remove their
  prose. If somebody deletes their account _because_ they want a manuscript
  gone, this does not do it. The answer for that is FR-2.6 — delete the
  storyboard first, then the account — and the deletion screen has to keep
  saying so, because the two are genuinely different requests and only one of
  them is what this is for.
- `cancelDeletion` is the one mutation that must work while the account is
  frozen, so it is `protectedProcedure` rather than `activeProcedure`. The
  structural test in `procedures.test.ts` names it as the single deliberate
  exception and fails if a second one appears.
- The daily `purge` job does both storyboards and accounts rather than a
  seventh cron entry. A scheduled entry that has to be added to a hosting
  account by hand is a step somebody forgets, and this endpoint fails closed —
  so forgetting it would be silent.
