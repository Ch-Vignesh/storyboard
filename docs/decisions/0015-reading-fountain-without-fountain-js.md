# 0015 — Reading Fountain without `fountain-js`

**Date:** 2026-09-15
**Status:** accepted
**Deviates from:** `02-architecture.md` section 5, which names `fountain-js` for `.fountain`

## The decision

`packages/import` reads Fountain with about sixty lines of its own rather than
with `fountain-js`.

## Why

Three reasons, in order of weight.

**The output shape is wrong for us.** `fountain-js` produces HTML tokens —
`<h3>INT. OFFICE - NIGHT</h3>`, `<p class="character">MARGARET</p>`. Every
extractor in this package produces `Block`s carrying a FR-4.1 node and the
source's own style name, because that is what the chapter cascade reads. Using
the library would mean parsing its HTML back into the shape we started from,
which is more code than parsing the format directly, and more places to be
wrong.

**The format is frozen; the package is not maintained.** Fountain 1.1 has not
changed since 2014. `fountain-js` last published in November 2023. A stale
dependency on a stable format is not dangerous, but it is also not buying us
anything: there is no upstream stream of fixes to follow.

**We need five element types, not a conformant parser.** Scene headings,
character cues, parentheticals, dialogue and transitions are what FR-4.2 stores
and what a manuscript importer has to recognise. Dual dialogue, emphasis
nesting, boneyards and the rest are either noted as dropped or fall through to
action, which is what FR-3.7 already promises.

## What this costs

An unusual Fountain file will be read less faithfully than a dedicated parser
would read it. That cost is bounded by FR-3.2: the writer sees the proposed
split before anything is saved, and a screenplay that came through wrong is
visibly wrong on the review screen rather than silently wrong in the database.

If the day comes that somebody imports a screenplay the hand-written reader
mangles, the fix is `packages/import/src/extract/screenplay.ts` and nothing
else — the `NormalisedDoc` boundary means swapping in a library later is a
one-file change.

## What was also considered

- **Using `fountain-js` and mapping its HTML.** Rejected: strictly more code
  than the direct read, and the mapping layer would itself need the element
  detection we are trying to avoid writing.
- **Refusing `.fountain` until a better parser exists.** Rejected: FR-3.1 lists
  it, and a screenwriter with a Fountain file is exactly the person this feature
  is for.

Related: [[0005-toolchain-versions]] on how dependencies are pinned here.
