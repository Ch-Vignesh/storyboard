/**
 * The one canonical document format for all stored prose (FR-4.1).
 *
 * A restricted ProseMirror JSON schema, expressed in Zod so that it is the
 * *server* that decides what is storable. The editor enforces the same set in
 * the browser, but paste filtering that only runs client-side is decoration:
 * anything reaching `section.commitRevision` is parsed through here first, and
 * a document that does not fit is rejected rather than quietly stored.
 *
 * Nothing else is storable. Adding a node means changing FR-4.1 first.
 */

import { z } from 'zod'

/** FR-4.1 — the only marks prose may carry. */
export const MARK_TYPES = ['em', 'strong', 'strike'] as const
export type MarkType = (typeof MARK_TYPES)[number]

export const markSchema = z.object({ type: z.enum(MARK_TYPES) })

/** A run of text, optionally marked. Empty strings are not valid ProseMirror. */
export const textNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).max(MARK_TYPES.length).optional(),
})

export const hardBreakSchema = z.object({ type: z.literal('hard_break') })

/** What can appear inside a paragraph-like block. */
export const inlineSchema = z.union([textNodeSchema, hardBreakSchema])
export type InlineNode = z.infer<typeof inlineSchema>

const inlineContent = z.array(inlineSchema).optional()

export const paragraphSchema = z.object({
  type: z.literal('paragraph'),
  content: inlineContent,
})

export const headingSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  content: inlineContent,
})

/** FR-4.1 — a break between scenes, rendered as a mark on the page, not a rule. */
export const sceneBreakSchema = z.object({ type: z.literal('scene_break') })

/** Blockquote holds paragraphs; nesting quotes inside quotes is not storable. */
export const blockquoteSchema = z.object({
  type: z.literal('blockquote'),
  content: z.array(paragraphSchema).min(1),
})

export const proseBlockSchema = z.union([
  paragraphSchema,
  headingSchema,
  blockquoteSchema,
  sceneBreakSchema,
])

/**
 * FR-4.2 — the screenplay node set. Each is a block of inline content; the
 * difference between them is semantic and drives the industry margins the
 * reader and editor render in Courier Prime.
 */
export const SCREENPLAY_BLOCK_TYPES = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
] as const
export type ScreenplayBlockType = (typeof SCREENPLAY_BLOCK_TYPES)[number]

export const screenplayBlockSchema = z.object({
  type: z.enum(SCREENPLAY_BLOCK_TYPES),
  content: inlineContent,
})

/**
 * A screenplay may also use scene breaks and plain paragraphs — an author
 * pasting a note into an outline should not be refused — but not headings or
 * blockquotes, which have no meaning in a script.
 */
export const screenplayDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.union([screenplayBlockSchema, paragraphSchema, sceneBreakSchema])),
})

export const proseDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(proseBlockSchema),
})

export type ProseDoc = z.infer<typeof proseDocSchema>
export type ScreenplayDoc = z.infer<typeof screenplayDocSchema>
export type StoryboardDoc = ProseDoc | ScreenplayDoc

/** Which node set a storyboard's sections use (FR-4.2). */
export type DocFlavour = 'prose' | 'screenplay'

/**
 * Stage plays share the screenplay node set: the elements are the same, only
 * the margins differ, and a separate schema would double the surface for no
 * gain. Everything else — including poetry, which is paragraphs with
 * deliberate line breaks — is prose.
 */
export function flavourForStoryType(type: string): DocFlavour {
  return type === 'SCREENPLAY' || type === 'STAGE_PLAY' ? 'screenplay' : 'prose'
}

export function docSchemaFor(flavour: DocFlavour) {
  return flavour === 'screenplay' ? screenplayDocSchema : proseDocSchema
}

/**
 * The document a new section starts as (FR-2.2): one empty paragraph. Not an
 * empty `content` array — ProseMirror requires at least one block, and an
 * editor opened on a truly empty doc has nowhere to put the cursor.
 */
export function emptyDoc(flavour: DocFlavour = 'prose'): StoryboardDoc {
  return flavour === 'screenplay'
    ? { type: 'doc', content: [{ type: 'action', content: [] }] }
    : { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
}

/**
 * Parse untrusted JSON into a canonical document, or throw. This is the only
 * sanctioned way in: `contentJson` is a Prisma `Json` column and therefore
 * `unknown` at the type level until it has been through here.
 */
export function parseDoc(value: unknown, flavour: DocFlavour = 'prose'): StoryboardDoc {
  return docSchemaFor(flavour).parse(value)
}

export function safeParseDoc(value: unknown, flavour: DocFlavour = 'prose') {
  return docSchemaFor(flavour).safeParse(value)
}
