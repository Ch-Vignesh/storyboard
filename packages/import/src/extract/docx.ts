import mammoth from 'mammoth'

import { isSceneBreakLine, sceneBreak, text } from './blocks'
import { normalise, readPageStarts } from './page-breaks'
import { assertReasonableArchive } from './zip-guard'
import type { Block, NormalisedDoc, TipTapNode } from '../types'

/**
 * `.docx` — paragraphs, their style names, and page breaks.
 *
 * `mammoth` converts to HTML, and the style map below is what makes the
 * conversion useful to FR-3.3: Word's own heading styles survive as `<h1>`.
 * Without it, a manuscript formatted with Heading 1 would arrive as anonymous
 * paragraphs and the first and best detection strategy would never fire.
 *
 * Page breaks are the exception — mammoth drops them, whatever the style map
 * says — so they come from the document XML instead (`page-breaks.ts`).
 *
 * The HTML is then walked by hand rather than with a DOM library: the subset
 * mammoth emits is small and known, and a hand walk over it is shorter than
 * pulling in a parser to read six tag names.
 */

/**
 * Word's styles to HTML. Everything not named here arrives as `<p>`, which is
 * exactly right: FR-3.7 promises paragraphs, not layout.
 */
const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Chapter Title'] => h1:fresh",
  "p[style-name='Chapter'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Block Text'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
].join('\n')

type Tag = { name: string; attrs: string; inner: string }

/** Pulls the top-level elements out of mammoth's HTML, in order. */
function topLevel(html: string): Tag[] {
  const out: Tag[] = []
  let index = 0

  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) break

    const close = html.indexOf('>', open)
    if (close === -1) break

    const raw = html.slice(open + 1, close)
    const selfClosing = raw.endsWith('/')
    const name = /^[a-zA-Z0-9-]+/u.exec(raw)?.[0] ?? ''
    const attrs = raw.slice(name.length).replace(/\/$/u, '')

    if (selfClosing || name === 'br' || name === 'img') {
      out.push({ name, attrs, inner: '' })
      index = close + 1
      continue
    }

    // Find the matching close tag, counting nested tags of the same name.
    let depth = 1
    let cursor = close + 1
    let end = -1
    while (cursor < html.length && depth > 0) {
      const next = html.indexOf('<', cursor)
      if (next === -1) break
      const nextClose = html.indexOf('>', next)
      if (nextClose === -1) break
      const nextRaw = html.slice(next + 1, nextClose)
      const nextName = /^\/?[a-zA-Z0-9-]+/u.exec(nextRaw)?.[0] ?? ''
      if (nextName === name) depth += 1
      else if (nextName === `/${name}`) {
        depth -= 1
        if (depth === 0) end = next
      }
      cursor = nextClose + 1
    }

    if (end === -1) {
      index = close + 1
      continue
    }

    out.push({ name, attrs, inner: html.slice(close + 1, end) })
    index = html.indexOf('>', end) + 1
  }

  return out
}

function decode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
}

/** Inline HTML to marked text nodes. Only FR-4.1's three marks survive. */
function inline(html: string, marks: string[] = []): TipTapNode[] {
  const out: TipTapNode[] = []
  let index = 0

  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) {
      const tail = decode(html.slice(index))
      if (tail.length > 0) out.push(text(tail, marks))
      break
    }

    const before = decode(html.slice(index, open))
    if (before.length > 0) out.push(text(before, marks))

    const close = html.indexOf('>', open)
    if (close === -1) break
    const raw = html.slice(open + 1, close)
    const name = /^\/?[a-zA-Z0-9-]+/u.exec(raw)?.[0] ?? ''

    if (name === 'br') {
      out.push({ type: 'hard_break' })
      index = close + 1
      continue
    }

    const mark =
      name === 'em' || name === 'i'
        ? 'em'
        : name === 'strong' || name === 'b'
          ? 'strong'
          : name === 's' || name === 'del' || name === 'strike'
            ? 'strike'
            : null

    const endTag = `</${name}>`
    const end = html.indexOf(endTag, close)
    if (end === -1) {
      index = close + 1
      continue
    }

    const innerHtml = html.slice(close + 1, end)
    out.push(...inline(innerHtml, mark ? [...marks, mark] : marks))
    index = end + endTag.length
  }

  return out
}

function plainText(nodes: TipTapNode[]): string {
  return nodes
    .map((node) => (node.type === 'text' ? (node.text ?? '') : ' '))
    .join('')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

export async function extractDocx(file: Buffer | ArrayBuffer): Promise<NormalisedDoc> {
  const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file)
  // FR-3.1's limit is on what arrives; this is the limit on what it becomes.
  assertReasonableArchive(buffer)

  const result = await mammoth.convertToHtml(
    { buffer },
    { styleMap: STYLE_MAP, ignoreEmptyParagraphs: false },
  )

  const blocks: Block[] = []
  const footnotes: string[] = []
  const dropped = new Set<string>()

  // FR-3.3 strategy 4. Mammoth drops page breaks, so they come from the
  // document XML as the text each one precedes, matched here in order.
  const pageStarts = readPageStarts(buffer)
  let nextPageStart = 0

  const push = (json: TipTapNode, value: string, style?: string) => {
    if (value.length === 0 && json.type === 'paragraph') return
    const block: Block = { text: value, json }
    if (style) block.style = style
    if (nextPageStart < pageStarts.length && normalise(value) === pageStarts[nextPageStart]) {
      block.isPageBreak = true
      nextPageStart += 1
    }
    blocks.push(block)
  }

  for (const element of topLevel(result.value)) {
    switch (element.name) {
      case 'h1':
      case 'h2':
      case 'h3': {
        const level = Number(element.name[1]) as 1 | 2 | 3
        const content = inline(element.inner)
        push(
          { type: 'heading', attrs: { level }, ...(content.length > 0 ? { content } : {}) },
          plainText(content),
          `Heading ${String(level)}`,
        )
        break
      }
      case 'h4':
      case 'h5':
      case 'h6': {
        // FR-3.7 preserves headings 1 to 3. Deeper ones become level 3 rather
        // than disappearing; a writer who used Heading 4 meant a heading.
        const content = inline(element.inner)
        push(
          { type: 'heading', attrs: { level: 3 }, ...(content.length > 0 ? { content } : {}) },
          plainText(content),
          'Heading 3',
        )
        break
      }
      case 'blockquote': {
        const paragraphs = topLevel(element.inner)
          .filter((child) => child.name === 'p')
          .map((child) => {
            const content = inline(child.inner)
            const paragraph: TipTapNode =
              content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
            return paragraph
          })
        if (paragraphs.length > 0) {
          push({ type: 'blockquote', content: paragraphs }, plainText(inline(element.inner)))
        }
        break
      }
      case 'p': {
        const content = inline(element.inner)
        const value = plainText(content)
        if (value.length === 0) break
        if (isSceneBreakLine(value)) {
          blocks.push(sceneBreak())
          break
        }
        push({ type: 'paragraph', content }, value)
        break
      }
      case 'ul':
      case 'ol': {
        for (const item of topLevel(element.inner)) {
          const content = inline(item.inner)
          const value = plainText(content)
          if (value.length > 0) push({ type: 'paragraph', content }, value)
        }
        dropped.add('list bullets and numbering')
        break
      }
      case 'table':
        dropped.add('tables')
        break
      case 'img':
        dropped.add('images')
        break
      default: {
        const content = inline(element.inner)
        const value = plainText(content)
        if (value.length > 0) push({ type: 'paragraph', content }, value)
      }
    }
  }

  // FR-3.7 — footnote text survives, its numbering does not. Mammoth appends
  // footnotes as a trailing list; anything it warned about is worth naming.
  for (const message of result.messages) {
    if (/image/iu.test(message.message)) dropped.add('images')
    if (/comment/iu.test(message.message)) dropped.add('comments')
  }

  return { blocks, footnotes, dropped: [...dropped] }
}
