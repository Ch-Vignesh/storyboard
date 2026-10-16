import type { RequestKind } from '@storyboard/db'

import { type DocFlavour, type StoryboardDoc, parseDoc } from '@/lib/doc/schema'
import { isEmptyDoc } from '@/lib/doc/text'

type Block = StoryboardDoc['content'][number]

/**
 * What a section reads once a suggestion is accepted (FR-8.1, decision 0038).
 *
 * A rewrite was written as the whole section, starting from its text
 * (FR-6.1), so it becomes the text. A continuation is what comes next: it was
 * written from an empty page, after the words already there, and it goes after
 * them. Until 2026-10-16 every accepted suggestion replaced the section, so
 * accepting "what comes next" erased the author's opening and left only the
 * continuation: found by the owner in the first real test of the loop.
 *
 * Blank paragraphs where the two meet are dropped, so the join reads as one
 * passage. A section with no words yet simply becomes the continuation.
 *
 * Used by `suggestion.accept` and by the comparison the author sees before
 * accepting, so what they are shown is what they will get.
 */
export function acceptedDoc(
  kind: RequestKind,
  head: unknown,
  suggestion: unknown,
  flavour: DocFlavour,
): StoryboardDoc {
  const offered = parseDoc(suggestion, flavour)
  if (kind !== 'CONTINUE' || head === null || head === undefined) return offered

  const current = parseDoc(head, flavour)
  if (isEmptyDoc(current)) return offered

  const before = [...current.content]
  while (before.length > 0 && isBlank(before.at(-1))) before.pop()
  const after = [...offered.content]
  while (after.length > 0 && isBlank(after[0])) after.shift()

  return { type: 'doc', content: [...before, ...after] } as StoryboardDoc
}

/** An empty paragraph, not a scene break: a scene break is empty on purpose. */
function isBlank(block: Block | undefined): boolean {
  if (!block || block.type === 'scene_break') return false
  return isEmptyDoc({ type: 'doc', content: [block] } as StoryboardDoc)
}
