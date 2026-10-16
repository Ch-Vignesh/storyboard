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

import { Extension, Node, mergeAttributes } from '@tiptap/core'
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

/**
 * FR-4.1 names this node `hard_break`, not `hardBreak`. Shift-Enter only:
 * TipTap also binds Mod-Enter to a line break, which is the scene break's
 * shortcut (FR-4.6), and the toolbar's "Ctrl Enter" inserted a line break
 * until the 2026-10-16 spec review.
 */
const LineBreak = HardBreak.extend({
  name: 'hard_break',
  addKeyboardShortcuts() {
    return { 'Shift-Enter': () => this.editor.commands.setHardBreak() }
  },
})

/**
 * A quote holds paragraphs, as the stored schema says (`schema.ts`). TipTap's
 * own allows any block, so a heading or a scene break could go inside one in
 * the editor, and then every save failed against the stored schema until the
 * writer undid it (2026-10-16 spec review).
 */
const Quote = Blockquote.extend({ content: 'paragraph+' })

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
  // FR-4.6 — a keyboard shortcut for each of the four.
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertContent({ type: this.name }) }
  },
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

/**
 * FR-4.2 in the editor (decision 0040): a script is written element by
 * element, as every screenplay editor does it. Until the 2026-10-16 spec
 * review the elements arrived only by import, and a new screenplay was
 * written as one long run of action.
 *
 * Enter at the end of a line starts the element that usually follows it;
 * Tab and Shift-Tab change the line's element; Escape leaves the editor, so
 * Tab does not trap a keyboard user in it (WCAG 2.1.2).
 */
export const NEXT_ELEMENT: Record<ScreenplayBlockType, ScreenplayBlockType> = {
  scene_heading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene_heading',
}

/** The order Tab moves through. */
export const ELEMENT_CYCLE: readonly ScreenplayBlockType[] = [
  'action',
  'scene_heading',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
]

function isElement(name: string): name is ScreenplayBlockType {
  return (SCREENPLAY_BLOCK_TYPES as readonly string[]).includes(name)
}

const ScreenplayKeys = Extension.create({
  name: 'screenplayKeys',
  addKeyboardShortcuts() {
    const cycle = (step: 1 | -1) => () => {
      const name = this.editor.state.selection.$from.parent.type.name
      const at = ELEMENT_CYCLE.indexOf(isElement(name) ? name : 'action')
      const next = ELEMENT_CYCLE[(at + step + ELEMENT_CYCLE.length) % ELEMENT_CYCLE.length]
      return next ? this.editor.commands.setNode(next) : false
    }
    return {
      Tab: cycle(1),
      'Shift-Tab': cycle(-1),
      Escape: () => this.editor.commands.blur(),
      Enter: () => {
        const { $from, empty } = this.editor.state.selection
        const name = $from.parent.type.name
        // Mid-line, or a selection: the ordinary split, same element.
        if (!empty || !isElement(name) || $from.parentOffset < $from.parent.content.size) {
          return false
        }
        // An empty character or parenthetical line was a false start:
        // Enter makes it action rather than another of the same.
        if ($from.parent.content.size === 0 && name !== 'action') {
          return this.editor.commands.setNode('action')
        }
        return this.editor.chain().splitBlock().setNode(NEXT_ELEMENT[name]).run()
      },
    }
  },
})

export function extensionsFor(flavour: DocFlavour, placeholder = 'Start writing.') {
  if (flavour === 'screenplay') {
    // No headings or quotes in a script; the elements carry the structure.
    return [...base(placeholder), ...SCREENPLAY_BLOCK_TYPES.map(screenplayNode), ScreenplayKeys]
  }
  return [...base(placeholder), Heading.configure({ levels: [1, 2, 3] }), Quote]
}
