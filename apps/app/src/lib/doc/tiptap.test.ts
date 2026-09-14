/**
 * The editor schema and the server schema are two statements of FR-4.1, and a
 * disagreement between them is invisible until a writer loses a paragraph. This
 * holds them to the same set.
 */

import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { MARK_TYPES, SCREENPLAY_BLOCK_TYPES, safeParseDoc } from './schema'
import { extensionsFor } from './tiptap'

const proseSchema = getSchema(extensionsFor('prose'))
const screenplaySchema = getSchema(extensionsFor('screenplay'))

describe('the editor schema matches the server schema (FR-4.1)', () => {
  it('defines exactly the prose nodes the requirement lists', () => {
    expect(Object.keys(proseSchema.nodes).sort()).toEqual(
      ['blockquote', 'doc', 'hard_break', 'heading', 'paragraph', 'scene_break', 'text'].sort(),
    )
  })

  it('defines exactly the three marks, under the names the requirement uses', () => {
    // em and strong, not italic and bold.
    expect(Object.keys(proseSchema.marks).sort()).toEqual([...MARK_TYPES].sort())
  })

  it('defines the screenplay elements and no headings or quotes', () => {
    const nodes = Object.keys(screenplaySchema.nodes)
    for (const element of SCREENPLAY_BLOCK_TYPES) {
      expect(nodes).toContain(element)
    }
    expect(nodes).not.toContain('heading')
    expect(nodes).not.toContain('blockquote')
  })

  it('has no node the server would reject', () => {
    // Every block node the editor can produce must survive the Zod schema.
    for (const name of Object.keys(proseSchema.nodes)) {
      if (name === 'doc' || name === 'text' || name === 'hard_break') continue
      const node =
        name === 'heading'
          ? { type: 'heading', attrs: { level: 1 }, content: [] }
          : name === 'blockquote'
            ? { type: 'blockquote', content: [{ type: 'paragraph', content: [] }] }
            : { type: name, content: [] }
      const doc = { type: 'doc', content: [node] }
      expect(safeParseDoc(doc).success, `${name} should be storable`).toBe(true)
    }
  })

  it('cannot produce the nodes FR-4.1 excludes', () => {
    for (const excluded of [
      'bulletList',
      'orderedList',
      'listItem',
      'codeBlock',
      'code',
      'horizontalRule',
      'image',
      'table',
      'link',
      'underline',
    ]) {
      expect(proseSchema.nodes[excluded]).toBeUndefined()
      expect(proseSchema.marks[excluded]).toBeUndefined()
    }
  })
})

describe('node shapes', () => {
  it('makes the scene break an atomic block', () => {
    // Atomic so the caret cannot land inside it and it round-trips whole.
    expect(proseSchema.nodes.scene_break?.isBlock).toBe(true)
    expect(proseSchema.nodes.scene_break?.isAtom).toBe(true)
  })

  it('limits headings to levels 1 to 3', () => {
    expect(proseSchema.nodes.heading?.spec.attrs?.level).toBeDefined()
    const level4 = { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 }, content: [] }] }
    expect(safeParseDoc(level4).success).toBe(false)
  })

  it('lets a blockquote hold paragraphs and nothing else', () => {
    expect(proseSchema.nodes.blockquote?.spec.content).toBe('block+')
    // The server is the stricter of the two: quotes hold paragraphs only, so a
    // quoted heading is not storable even though ProseMirror would allow it.
    const quotedHeading = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'heading', attrs: { level: 2 }, content: [] }],
        },
      ],
    }
    expect(safeParseDoc(quotedHeading).success).toBe(false)
  })
})
