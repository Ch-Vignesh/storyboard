# 0048 — Profile pictures live in Postgres, as icons

**Date:** 2026-10-18
**Status:** accepted (D-5, owner 2026-10-18); built by phase 14, item 3.13
**Amends:** `02-architecture.md`'s `User.avatarUrl`, which implied a file in
the object store; FR-9.2's "avatars" now have a source

## Why

The architecture gave `User` an `avatarUrl` and nothing ever set it: the
column was a placeholder for "a picture in R2, like an import". The owner's
answer to D-5 was narrower than that: a picture, yes, but compressed to the
fewest pixels that still read as a face at the sizes it is drawn.

At those sizes a picture is not a file, it is a row. Cut square and shrunk to
`AVATAR.sizePx` a side as WebP, a profile picture is a few kilobytes: smaller
than the bio column beside it, and far smaller than the manuscript revisions
the same table already holds. Putting it in the object store would mean a
second bucket policy, signed URLs or a public prefix, a CORS rule, a purge
that has to reach into R2 to keep decision 0024's promise, and a backup that
no longer contains the whole account. Putting it in the database means none
of that: the nightly backup has it, the purge deletes the row in the same
transaction that strips the name, and the only new moving part is `sharp`,
which the framework already ships.

## What

- `UserAvatar { userId, bytes, contentType, updatedAt }`, one row per
  person, written only by `settings.setAvatar` after `shrinkAvatar` has
  decoded the upload, checked it is a JPEG, PNG or WebP, and produced the
  icon. The route at `/api/avatar` reads the upload and does the shrink; the
  procedure shrinks again before storing, so nothing but the icon form ever
  reaches the table whoever calls it.
- Served from `/u/[username]/avatar?v=<updatedAt>`, cached for a year as
  immutable; a new picture is a new URL. `nosniff`, always.
- Drawn by `UserAvatar`, which falls back to `InitialsAvatar`: up to two
  initials on one of a fixed set of tones chosen by the username. Both are
  decorative; the name is always written beside them.
- `User.avatarUrl` stays, unused and commented as such. Dropping a column is
  a decision, not a side effect of another one.

## What this rules out

- Pictures larger than the icon. There is no "view full size"; there is no
  full size. If the product ever wants portraits, that is an object-store
  decision taken on purpose, not a bigger `Bytes` column.
- Animated pictures. `sharp` reads the first frame; a GIF is refused outright
  because it is not one of the three kinds D-5 accepted.

## Limits

`AVATAR` in `lib/schemas/constants.ts`: five megabytes in, 96 pixels a side,
at most 24 kilobytes stored, twenty uploads an hour per account.
