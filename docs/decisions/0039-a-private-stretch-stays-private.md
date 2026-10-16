# 0039 — A private stretch stays private

**Date:** 2026-10-16
**Status:** accepted
**Amends:** 0007, whose table left `publicFrom` alone on "private → public a second time"

## Why

Decision 0007 keeps what was written before a story was first public with its
authors: readers see revisions from `publicFrom` on. It stamps `publicFrom`
once and never moves it, because what has been public cannot be unseen.

That left a gap the spec review found. A story public in September, private
in October and public again in November showed readers everything written in
October: it is all after `publicFrom`. Nothing written in October was ever
public. FR-2.7's promise, that going public exposes history "from the switch
point forward", was kept for the first switch only.

The owner chose to keep it private.

## The decision

Every stretch a once-public story spends private is recorded as a
`PrivateSpan` (start, end; open while private). A reader sees a revision, or a
suggestion's words, only if it was written at or after `publicFrom` and
outside every span. Authors see everything, as before.

- `setVisibility` opens a span on the way to private, if the story has ever
  been public and none is open, and closes it on the way back.
- `lib/authz` holds the rule once: `writtenWhilePrivate` for a single instant,
  and a `where` builder for lists, used by the revision and suggestion
  fragments. The profile's check on a credited suggestion uses the same
  function.
- The reader names each stretch in which something was written, as it already
  names the time before `publicFrom`.

`publicFrom` itself is unchanged and still written once. What was public in
September stays readable in November.

## The migration

A story private at the time of the migration and public before it is already
in a stretch whose start was never recorded. Its span starts at `publicFrom`:
if it goes public again, everything since its first publication stays with
its authors. That hides too much rather than too little, for stories that
were private when this shipped.

## Also

`compare.suggestionAgainstHead` never applied 0007's rule for suggestions,
though `suggestion.get` did, so the words of one sent while a story was private
could be read through the comparison. It applies the rule now.
