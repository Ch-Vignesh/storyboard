import { Lexer, type Token, type Tokens } from 'marked'

import { heading, isSceneBreakLine, paragraph, sceneBreak, text } from './blocks'
import type { Block, NormalisedDoc, TipTapNode } from '../types'

/**
 * `.md` — headings and emphasis (architecture section 5).
 *
 * `marked`'s lexer is used rather than its renderer: the renderer produces
 * HTML, which would then have to be parsed back into nodes. The token stream
 * is already the structure, and mapping it directly means every node built here
 * is one FR-4.1 allows. Anything else in the token stream — tables, images,
 * lists, code — is named in `dropped` rather than silently discarded.
 */

/** Inline tokens to the marks FR-4.1 permits. */
function inline(tokens: Token[] | undefined, marks: string[] = []): TipTapNode[] {
  if (!tokens) return []
  const out: TipTapNode[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape':
      case 'html': {
        const value = (token as Tokens.Text).text
        // `text` tokens can themselves hold children when they contain markup.
        const children = (token as Tokens.Text).tokens
        if (children && children.length > 0) {
          out.push(...inline(children, marks))
        } else if (value.length > 0) {
          out.push(text(value, marks))
        }
        break
      }
      case 'em':
        out.push(...inline((token as Tokens.Em).tokens, [...marks, 'em']))
        break
      case 'strong':
        out.push(...inline((token as Tokens.Strong).tokens, [...marks, 'strong']))
        break
      case 'del':
        out.push(...inline((token as Tokens.Del).tokens, [...marks, 'strike']))
        break
      case 'codespan':
        out.push(text((token as Tokens.Codespan).text, marks))
        break
      case 'br':
        out.push({ type: 'hard_break' })
        break
      case 'link':
        // The words survive; the address does not (FR-3.7 keeps prose, not links).
        out.push(...inline((token as Tokens.Link).tokens, marks))
        break
      default: {
        const raw = (token as { text?: string }).text
        if (raw) out.push(text(raw, marks))
      }
    }
  }

  return out
}

function paragraphFrom(tokens: Token[] | undefined, raw: string): TipTapNode {
  const content = inline(tokens)
  return content.length > 0 ? { type: 'paragraph', content } : paragraph(raw)
}

export function extractMarkdown(source: string): NormalisedDoc {
  const blocks: Block[] = []
  const footnotes: string[] = []
  const dropped = new Set<string>()

  const push = (json: TipTapNode, plain: string, style?: string) => {
    blocks.push({ text: plain.trim(), json, ...(style ? { style } : {}) })
  }

  for (const token of Lexer.lex(source)) {
    switch (token.type) {
      case 'heading': {
        const node = token as Tokens.Heading
        const level = Math.min(node.depth, 3) as 1 | 2 | 3
        const content = inline(node.tokens)
        push(
          content.length > 0
            ? { type: 'heading', attrs: { level }, content }
            : heading(node.text, level),
          node.text,
          `Heading ${String(level)}`,
        )
        break
      }
      case 'paragraph': {
        const node = token as Tokens.Paragraph
        if (isSceneBreakLine(node.text)) {
          blocks.push(sceneBreak())
          break
        }
        push(paragraphFrom(node.tokens, node.text), node.text)
        break
      }
      case 'hr':
        // FR-3.4 — a horizontal rule in a manuscript is a scene break.
        blocks.push(sceneBreak())
        break
      case 'blockquote': {
        const node = token as Tokens.Blockquote
        const paragraphs = ((node.tokens as Token[] | undefined) ?? [])
          .filter((child): child is Tokens.Paragraph => child.type === 'paragraph')
          .map((child) => paragraphFrom(child.tokens, child.text))
        if (paragraphs.length > 0) {
          push({ type: 'blockquote', content: paragraphs }, node.text)
        }
        break
      }
      case 'code': {
        // Not storable (FR-4.1) and not prose; kept as a paragraph so the words
        // are not lost, since in a manuscript an indented block is usually a
        // letter or an inscription rather than code.
        const node = token as Tokens.Code
        push(paragraph(node.text), node.text)
        dropped.add('code formatting')
        break
      }
      case 'list': {
        const node = token as Tokens.List
        for (const item of node.items) {
          push(paragraph(item.text), item.text)
        }
        dropped.add('list bullets and numbering')
        break
      }
      case 'table':
        dropped.add('tables')
        break
      case 'space':
        break
      default: {
        const raw = (token as { text?: string }).text
        if (raw && raw.trim().length > 0) push(paragraph(raw), raw)
      }
    }
  }

  return { blocks, footnotes, dropped: [...dropped] }
}
