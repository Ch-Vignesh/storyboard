# 0016 — A co-author has a bigger quota, not an exemption

**Date:** 2026-09-15
**Status:** accepted
**Resolves:** OD-6 (co-author quota exemption across storyboards)
**Deviates from:** `01-srs.md` FR-13.2, which exempts co-authors outright

## The question

FR-13.2 caps a contributor at three suggestions in `submitted` state per
storyboard, and exempts "owners and co-authors on their own storyboards". OD-6
asks whether that exemption is safe: if Sam co-authors a storyboard Maya owns,
Sam has no ceiling there at all, and co-authorship is a thing an author can hand
out in one click.

## The decision

Three tiers, per storyboard:

| Who                   | Submitted suggestions at once |
| --------------------- | ----------------------------- |
| The owner             | no cap                        |
| An accepted co-author | 10                            |
| Everyone else         | 3                             |

## Why

The argument for the exemption as written is real: a co-author can edit the
manuscript directly, so a cap on their _suggestions_ prevents nothing they could
not do another way. But that argument proves less than it looks. The quota is
not protecting the manuscript; it is protecting the **owner's attention**. A
submitted suggestion is a thing somebody has to read and decide about, and
thirty of them waiting is a burden whoever sent them.

So the cap stays for co-authors, and is raised because they are trusted and
because working by suggestion rather than by direct edit is a legitimate way for
a co-author to collaborate — some people would rather propose than impose, and
the product should not push them towards editing over somebody's shoulder.

The owner keeps no cap because a cap on your own storyboard is a cap on your own
attention, which is yours to spend.

## The cost, stated plainly

Ten is arbitrary. Three is arbitrary too — FR-13.2 does not defend it either —
but three has at least been in the spec since the beginning. Ten was chosen as
"clearly more than a handful, clearly less than a flood", and if it turns out to
be wrong it is one number in `lib/schemas/constants.ts`.

The alternative considered and rejected was owner-only exemption, which closes
the hole completely. It was rejected because it treats a co-author — somebody
the author invited and who can already rewrite their chapters — as a stranger,
which is a worse error than a generous ceiling.

## Where it lives

`quotaFor()` in `lib/authz`, beside the capability matrix, because it is a
question about what a role may do and NFR-6 says those are decided at the data
layer. `suggestion.submit` reads it inside the same transaction that counts.

Related: [[0011-one-public-name]] for the other open decision resolved this way.
