/**
 * The editor's half of FR-4.1.
 *
 * ProseMirror will not let a user type, or paste, a node its schema does not
 * define — so restricting the schema *is* the paste filter the requirement
 * asks for. There is no sanitising pass to forget to call.
 *
 * Every extension is listed by hand rather than taken from StarterKit. That is
 * deliberate: this list is the requirement, and a future StarterKit release
 * that quietly adds a node must not be able to widen what a manuscript can
 * hold.
 *
 * **Names.** FR-4.1 names the nodes and marks in ProseMirror's own vocabulary —
 * `hard_break`, `em`, `strong` — while TipTap's extensions default to
 * `hardBreak`, `italic`, `bold`. The canonical stored format is the one the SRS
 * specifies, so the three extensions are renamed here. That keeps `contentJson`
 * identical on both sides and means no lossy translation layer exists to drift.
 * `doc.test.ts` and `tiptap.test.ts` hold both halves to the same set.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Heading from '@tiptap/extension-heading'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import { Placeholder, UndoRedo } from '@tiptap/extensions'

import { SCREENPLAY_BLOCK_TYPES, type DocFlavour, type ScreenplayBlockType } from './schema'

/** FR-4.1 names this mark `em`, not `italic`. */
const Em = Italic.extend({ name: 'em' })

/** FR-4.1 names this mark `strong`, not `bold`. */
const Strong = Bold.extend({ name: 'strong' })

/** FR-4.1 names this node `hard_break`, not `hardBreak`. */
const LineBreak = HardBreak.extend({ name: 'hard_break' })

/**
 * FR-4.1 — a break between scenes. A node of its own rather than a horizontal
 * rule, because it is a beat in the manuscript that has to survive the round
 * trip through `contentJson` and out again into an export.
 */
export const SceneBreak = Node.create({
  name: 'scene_break',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'hr[data-scene-break]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'hr',
    mergeAttributes(HTMLAttributes, { 'data-scene-break': '', class: 'scene-break' }),
  ],
})

/** FR-4.2 — one node per screenplay element, each a plain block of inline text. */
function screenplayNode(name: ScreenplayBlockType) {
  return Node.create({
    name,
    group: 'block',
    content: 'inline*',
    parseHTML: () => [{ tag: `p[data-element="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => [
      'p',
      mergeAttributes(HTMLAttributes, { 'data-element': name, class: `sp-${name}` }),
      0,
    ],
  })
}

/** Shared by both flavours: the document spine, the three marks, undo. */
function base(placeholder: string) {
  return [
    Document,
    Paragraph,
    Text,
    Em,
    Strong,
    Strike,
    LineBreak,
    SceneBreak,
    UndoRedo,
    Placeholder.configure({ placeholder }),
  ]
}

export function extensionsFor(flavour: DocFlavour, placeholder = 'Start writing.') {
  if (flavour === 'screenplay') {
    // No headings or quotes in a script; the elements carry the structure.
    return [...base(placeholder), ...SCREENPLAY_BLOCK_TYPES.map(screenplayNode)]
  }
  return [...base(placeholder), Heading.configure({ levels: [1, 2, 3] }), Blockquote]
}
