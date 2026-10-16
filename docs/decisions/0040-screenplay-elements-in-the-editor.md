# 0040 — Screenplay elements in the editor

**Date:** 2026-10-16
**Status:** accepted
**Amends:** FR-4.6, for screenplay-type stories only

## Why

FR-4.2 gives screenplays their own node set: scene heading, action,
character, parenthetical, dialogue, transition. The schema, the reader's
Courier Prime and industry margins, the importer and the Fountain export all
had it. The editor did not: nothing could make a line a character or a scene
heading, so a screenplay started in Draftboard was one long run of action,
and the elements existed only in imported scripts. The spec review found it,
and the owner asked for it to be built.

FR-4.6 limits the editor's controls to italic, bold, quote and scene break.
That is right for prose and cannot be right for a script, where the element
is the formatting.

## The decision

For a screenplay, and only a screenplay:

- An **Element** menu in the toolbar names the element of the line under the
  cursor and changes it. It is on screen whatever the cursor does, so the
  writer always knows what they are typing.
- **Enter** at the end of a line starts the element that usually follows:
  action after a scene heading, dialogue after a character or a
  parenthetical, action after dialogue, a scene heading after a transition.
  Enter on an empty character or parenthetical line makes it action, as a
  false start. Mid-line, Enter splits as it always does.
- **Tab** and **Shift-Tab** move the line through the elements, as screenplay
  editors have taught writers to expect.
- **Escape** leaves the editor. Tab no longer moves focus out of it, and a
  keyboard user needs a way out that does not depend on the mouse
  (WCAG 2.1.2).

The suggestion composer has the same menu and keys, so a helper writes a
suggestion for a script in the script's own form.

Prose is unchanged: four controls, as FR-4.6 says.

## Also

The reader switched to Courier Prime only when a script held a scene heading
or a line of dialogue. A new script starts as one action line, so it was set
in the prose face. Any element switches it now.
