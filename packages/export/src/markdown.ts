import { frontMatterLines, sourceLine } from './front-matter'
import type { BlockNode, InlineNode, Manuscript } from './types'

/** Escapes the characters Markdown would otherwise read as markup. */
function escape(value: string): string {
  return value.replaceAll(/([\\`*_[\]<>])/gu, '\\$1')
}

function inline(nodes: InlineNode[] | BlockNode[] | undefined): string {
  if (!nodes) return ''
  return (nodes as InlineNode[])
    .map((node) => {
      if (node.type === 'hard_break') return '  \n'
      if (node.type !== 'text' || !node.text) return ''

      const marks = new Set((node.marks ?? []).map((mark) => mark.type))
      let value = escape(node.text)
      // Innermost first, so `***bold italic***` comes out the right way round.
      if (marks.has('em')) value = `*${value}*`
      if (marks.has('strong')) value = `**${value}**`
      if (marks.has('strike')) value = `~~${value}~~`
      return value
    })
    .join('')
}

function block(node: BlockNode): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level ?? 1, 1), 3)
      return `${'#'.repeat(level + 2)} ${inline(node.content)}`
    }
    case 'blockquote':
      return (node.content as BlockNode[])
        .map((child) => `> ${inline(child.content)}`)
        .join('\n>\n')
    case 'scene_break':
      // The glyph FR-3.4 reads back in, so a round trip keeps its breaks.
      return '* * *'
    // FR-4.2's screenplay elements. Markdown has no notion of them, so they
    // come out as Fountain's own conventions, which are plain text by design.
    case 'scene_heading':
      return `**${inline(node.content).toUpperCase()}**`
    case 'character':
      return inline(node.content).toUpperCase()
    case 'transition':
      return `> ${inline(node.content).toUpperCase()}`
    default:
      return inline(node.content)
  }
}

export function toMarkdown(manuscript: Manuscript): string {
  const parts: string[] = []

  // FR-14.3 — the front matter, before a word of the manuscript.
  parts.push(`# ${manuscript.title}`)
  parts.push(`*by ${manuscript.author}*`)

  if (manuscript.contributors.length > 0) {
    parts.push('## With contributions from')
    parts.push(
      manuscript.contributors
        .map((contributor) => `- ${contributor.name} — ${contributor.role}`)
        .join('\n'),
    )
  }

  if (manuscript.rightsNote && manuscript.rightsNote.trim().length > 0) {
    parts.push(`> ${manuscript.rightsNote.trim().replaceAll('\n', '\n> ')}`)
  }

  parts.push('---')

  for (const chapter of manuscript.chapters) {
    parts.push(`## ${chapter.title}`)
    for (const section of chapter.sections) {
      if (section.title) parts.push(`### ${section.title}`)
      parts.push(
        section.doc.content
          .map((node) => block(node))
          .filter((line) => line.length > 0)
          .join('\n\n'),
      )
    }
  }

  // FR-14.3 — and the source, after the last word.
  parts.push('---')
  parts.push(`*${sourceLine(manuscript)}*`)

  return `${parts.filter((part) => part.length > 0).join('\n\n')}\n`
}

/** Exported for the tests, which check the front matter without a whole file. */
export { frontMatterLines }
