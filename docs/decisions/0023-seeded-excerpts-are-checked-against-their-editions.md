# 0023 — Seeded excerpts are checked against their editions, by a script

**Date:** 2026-09-15
**Status:** accepted
**Closes:** phase 8 task 8
**Relates to:** FR-15.2

## What was wrong

The seed library transcribes twenty-five openings by hand so that `pnpm db:seed`
needs no network and is reproducible. The file said, in its own header comment,
that the transcriptions should be checked against the Gutenberg editions they
cite before launch, and called it "a small dishonesty" if they were not.

They were not. Checking them mechanically found **thirteen of forty-five
excerpts** did not match the edition they named:

- **A wrong citation.** "Mrs Dalloway" cited Gutenberg 63107, which is _Mrs
  Dalloway in Bond Street_ — the 1923 short story, a different work — while
  quoting the 1925 novel. The novel is 71865.
- **Invented full stops.** Five excerpts stopped mid-sentence and closed with a
  period the author did not write, turning a truncation into a misquotation.
- **A dropped clause.** Jane Eyre lost "(Mrs. Reed, when there was no company,
  dined early)" without any mark that anything had gone.
- **Moved and changed words.** "His pale grey eyes" for "His grey eyes";
  "misanthropist's heaven:" for "misanthropist's Heaven—"; a comma inserted into
  the first sentence of _Pride and Prejudice_; a colon for a semicolon in
  _Gulliver's Travels_; quotation marks dropped from Chopin's "bridges".

None of it changes what the passages are for. All of it is the kind of thing a
platform whose entire pitch is credit should not be casual about.

## The decision

`scripts/check-excerpts.ts`, run as `pnpm check-excerpts`. It fetches each cited
edition, normalises both sides for the typography editions genuinely disagree
about, and requires the excerpt to appear verbatim.

Normalisation is deliberately narrow: quote shape, dash width (an em dash is one
character in some editions and two hyphens in others), Gutenberg's `_italics_`
markers, soft hyphens, line wrapping, and case. It is blind to typography and
strict about letters, so a curly apostrophe is not a finding and a changed word
is.

All thirteen are fixed and the script passes on all forty-five.

## Where the truncations went

Several excerpts stop mid-sentence, and three of them must: the seeded request
hanging on them asks a contributor to write what comes next, so extending the
passage to the edition's next full stop would answer the question the stuck
point exists to ask. _Treasure Island_'s whole opening is one sentence, so any
excerpt of it truncates.

The fix was therefore not to extend them but to stop inventing punctuation. A
passage now ends where it ends, with no added period — which reads exactly like
what it is meant to be, a writer who stopped.

## The second finding: fixing the file was not enough

Correcting `library.ts` changed nothing in any database that had already been
seeded. `seedLibrary` was idempotent by _existence_ — it looked up each work by
`publicId` and skipped it — so a correction could never reach a database that
had run the seed once. On production that would have meant the misquotations
were permanent, and the fix above would have been a fix in a file nobody reads.

`seedLibrary` now reconciles the prose of works it skips, writing the correction
as a **new revision** rather than an update. That is not a workaround for the
NFR-3 trigger, it is the same thing the product does when an author edits a
section: revisions are append-only, so the wrong text stays in the history where
it belongs and the current revision is right.

Two guards on it. It only touches the main version, and only where the current
revision is one the platform wrote (`source: 'AUTHORED'`, authored by the
platform account). Twelve seeded sections currently hold a contributor's
accepted suggestion instead — those sections are _supposed_ to differ from the
library, because an accepted suggestion is what replaced the original — and a
seed script has no business overwriting somebody's accepted work.

Re-running the seed against the existing development database corrected eight
sections and then reported nothing on the next run.

## Why this is not in CI

It talks to gutenberg.org over the network. Putting it on every pull request
would make unrelated work fail when a third party is slow, and would ask a free
service for twenty-five files far more often than is polite.

It runs on a schedule and on demand instead (`.github/workflows/excerpts.yml`),
which is the right cadence for a check on data that only changes when somebody
edits the library. Downloads are cached, so a local re-run is free.

## Consequences

- Adding a work to the library means running `pnpm check-excerpts` before
  committing it. The header comment in `library.ts` now says so.
- The claim in FR-15.2 — that each work carries its source so the claim can be
  checked — is now a claim somebody has actually checked, with a command that
  re-checks it.
