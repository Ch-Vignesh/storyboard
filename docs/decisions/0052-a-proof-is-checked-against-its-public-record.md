# 0052 — A proof of authorship is checked against its public record, not signed

**Date:** 2026-10-24
**Status:** accepted (D-11, owner 2026-10-18); built by phase 14, item 8.12
**Amends:** FR-13.6's "a one-tap proof of authorship export produces a signed
PDF"; `02-architecture.md` section 6's `export.proofOfAuthorship`

## Why

FR-13.6 promised a signed PDF: title, author, section, word count, the
SHA-256 of the text and a timestamp. What shipped was a PDF that printed a
hash and a time and offered nothing to check either against. The address it
printed was the section's history page, which answers 404 to anyone but its
authors on a private story, so the person a writer handed the PDF to had no
way to see that Draftboard says the same. A contributor could not reach their
own proof from any screen; it was a link in the history panel only.

Signing would let a reader check the PDF without asking us, but it brings a
key to generate, store, rotate and never leak, and a signature only says that
we issued the document, which a public page says just as well. The owner
chose the page.

The owner also named a limit no design removes: the record shows who wrote
the words on Draftboard and when. It cannot show that they were original to
that person. A first draft copied from somewhere else gets a record like any
other, and nothing is built to detect that now.

## Decision

- Every saved version has a public record at `/proof/{revisionId}`, open to
  anyone with the address, guests included (`/proof` is not behind the
  account wall). It shows the SHA-256 of the section's plain text as stored,
  when the version was saved (in the reader's time zone and as an exact UTC
  timestamp), its word count and the writer's public name; for an accepted
  suggestion, the author who accepted it too.
- The story is named only to someone who may read that version: the story's
  read right, then decision 0007's rule that what was written while it was
  private stays with its authors (`canNameStoryOnRecord` in `lib/authz`,
  applied by `loadRevisionRecord` at the data layer). Anyone else reads
  "a private story". The hash, the time and the name say nothing about the
  words to someone who does not hold them.
- The page says that versions can't be changed once written (NFR-3: the
  trigger refuses every change to a saved version), and says in a sentence
  what the record is and is not.
- The PDF prints the record's address ("Check it at") instead of the history
  page, and the same sentence. It is issued to the writer the record names,
  while they may read that version, by the same data-layer rule as the page.
- A restored version's record says who restored it and points to the record
  of the version it copied. Its words were written by whoever wrote that
  one, so nobody is offered a proof of a restore; the restorer was, until
  this item.
- "Proof that you wrote this" leads to the record from the writer's history,
  their accepted suggestion's page, and the credits on their own profile.

## Consequences

- Checking a proof needs nothing but a browser and the text: compute the
  SHA-256 of the section's plain text (paragraphs separated by a blank line)
  and compare it with the record.
- The record is only as trustworthy as Draftboard's database and its
  operator. A signature would not have changed that; it would have moved it
  to the key.
- A writer who erases a contribution record (decision 0013) is no longer
  named on it: the record then names "a former contributor", and no PDF can
  be drawn from it.
- The record of a version on a private story still shows its hash, time,
  word count and writer to whoever has the address. Only people who could
  read the story ever see those addresses, so such a record becomes public
  only when one of them hands it out.
