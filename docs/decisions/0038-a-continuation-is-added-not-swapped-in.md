# 0038 — A continuation is added, not swapped in

**Date:** 2026-10-16
**Status:** accepted
**Amends:** FR-8.1, which made every accepted suggestion the section's whole text

## Why

The owner's first real test of the loop: one account asked for "what comes
next" on a short section, another wrote the next passage, and the first
accepted it. The section then held only the new passage; the opening was gone
from the story. It was still in the history, but nobody looking at the story
would know.

FR-8.1 says the accepted revision's content is the suggestion's content. That
is right for a rewrite: FR-6.1 starts a rewrite from the section's own text,
so the suggestion is the whole section as the helper would have it. It is
wrong for a continuation. FR-6.1 starts that from an empty page, and FR-5.7
only lets one be asked for on a section under 150 words, on the assumption
that such a section is a placeholder. A writer's 140 opening words are not a
placeholder.

## The decision

Accepting a suggestion on a `continue` request makes the section's text the
text the suggestion was written to follow (its base revision) **followed by**
the suggestion (`server/accepted-text.ts`). Blank paragraphs where the two
meet are dropped; a scene break is kept. A section with no words yet simply
becomes the continuation, as before. Rewrites are unchanged.

The base, not the current head, so that FR-6.8 holds for continuations as it
does for rewrites. Leah's and Arjun's continuations are both written after
the same opening; once Leah's is accepted, Arjun's is stale, and accepting it
too puts it in place of Leah's rather than stacking a second "next scene"
after the first. If Arjun updates his against the new text first, it follows
Leah's. The first version of this decision used the head, and the spec review
the same day caught the stacking.

The comparison the author sees before accepting shows the same thing: the
section as it would read afterwards, not the suggestion alone. Before this,
it struck through every word of the author's opening, as if that were meant.
The accept button's note says what will happen for each kind.

## What it means for credit and history

The new revision is attributed as FR-8.1 says: written by the contributor,
accepted by the author. It now also contains the author's opening, so
"written by" on that revision covers more than the contributor wrote. What
they wrote exactly is the suggestion, which is kept and linked from the
credit; the history's "What changed" view shows the passage that was added
and nothing else.
