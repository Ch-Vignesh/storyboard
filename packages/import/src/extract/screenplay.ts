import { XMLParser } from 'fast-xml-parser'

import { text } from './blocks'
import type { Block, NormalisedDoc, TipTapNode } from '../types'

/**
 * `.fountain` and `.fdx` — screenplays (FR-4.2's node set).
 *
 * Architecture section 5 names `fountain-js`. This reads Fountain by hand
 * instead; decision 0015 records why. The short version: the parser emits HTML
 * tokens that would have to be read back into nodes, its last release was in
 * 2023, and the part of the format a manuscript importer needs — scene
 * headings, characters, dialogue, parentheticals, transitions — is the part
 * the spec froze years ago.
 */

const SCENE_HEADING = /^(?:\.(?=[^.])|(?:int|ext|est|int\.?\/ext|i\/e)[.\s])/iu
const TRANSITION = /^(?:[A-Z\s]+TO:|FADE (?:IN|OUT)|CUT TO BLACK|DISSOLVE)\.?:?$/u
const ACT_BREAK =
  /^(?:act|part)\s+(?:[0-9]+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu

type ScreenplayType =
  'scene_heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition'

function block(type: ScreenplayType, value: string): Block {
  const trimmed = value.trim()
  const json: TipTapNode = {
    type,
    ...(trimmed.length > 0 ? { content: [text(trimmed)] } : {}),
  }
  return { text: trimmed, json, style: type }
}

/** True for a line that is a character cue: upper case, short, followed by speech. */
function isCharacterCue(line: string, next: string | undefined): boolean {
  if (next === undefined || next.trim().length === 0) return false
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length > 60) return false
  if (trimmed.startsWith('@')) return true
  if (!/\p{Lu}/u.test(trimmed)) return false
  // Upper case, allowing (V.O.), (CONT'D) and the like.
  return trimmed === trimmed.toUpperCase() && !/[.!?]$/u.test(trimmed.replace(/\([^)]*\)$/u, ''))
}

export function extractFountain(source: string): NormalisedDoc {
  const blocks: Block[] = []
  const dropped = new Set<string>()

  // Title page: `Title: …` key/value lines before the first blank line. The
  // values are metadata, not script, so they are noted and not imported.
  let body = source
  const titlePage = /^(?:[\w ]+:.*(?:\r?\n(?:[ \t]+.*)?)*\r?\n)+\r?\n/u.exec(source)
  if (titlePage && /^title\s*:/imu.test(titlePage[0])) {
    body = source.slice(titlePage[0].length)
    dropped.add('the title page')
  }

  const lines = body.split(/\r?\n/u)
  let inDialogue = false

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = raw.trim()

    if (line.length === 0) {
      inDialogue = false
      continue
    }

    // Boneyard and notes are the writer talking to themselves, not the script.
    if (line.startsWith('/*') || line.startsWith('[[')) {
      dropped.add('notes and comments')
      continue
    }
    if (line.startsWith('=') || line.startsWith('~')) {
      // Synopsis lines and lyrics: the first is metadata, the second is prose
      // the script needs, so only the synopsis goes.
      if (line.startsWith('=')) {
        dropped.add('synopsis lines')
        continue
      }
      blocks.push(block('action', line.replace(/^~\s*/u, '')))
      continue
    }
    if (line.startsWith('#')) {
      // A section heading: Fountain's own act/sequence marker.
      blocks.push(block('scene_heading', line.replace(/^#+\s*/u, '')))
      inDialogue = false
      continue
    }

    if (SCENE_HEADING.test(line) || ACT_BREAK.test(line)) {
      blocks.push(block('scene_heading', line.replace(/^\./u, '')))
      inDialogue = false
      continue
    }

    if (TRANSITION.test(line) || line.startsWith('>')) {
      blocks.push(block('transition', line.replace(/^>\s*/u, '').replace(/\s*<$/u, '')))
      inDialogue = false
      continue
    }

    if (inDialogue && line.startsWith('(') && line.endsWith(')')) {
      blocks.push(block('parenthetical', line))
      continue
    }

    if (inDialogue) {
      blocks.push(block('dialogue', line))
      continue
    }

    if (isCharacterCue(raw, lines[index + 1])) {
      blocks.push(block('character', line.replace(/^@/u, '')))
      inDialogue = true
      continue
    }

    blocks.push(block('action', line))
  }

  return { blocks, footnotes: [], dropped: [...dropped] }
}

/** Final Draft's element names to FR-4.2's. */
const FDX_TYPES: Record<string, ScreenplayType> = {
  'Scene Heading': 'scene_heading',
  Action: 'action',
  Character: 'character',
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'action',
  General: 'action',
}

type FdxText =
  string | { '#text'?: string | number } | Array<string | { '#text'?: string | number }>
type FdxParagraph = { '@_Type'?: string; Text?: FdxText }

function fdxText(value: FdxText | undefined): string {
  if (value === undefined) return ''
  const one = (entry: string | { '#text'?: string | number }): string =>
    typeof entry === 'string' ? entry : String(entry['#text'] ?? '')
  return (Array.isArray(value) ? value.map(one).join('') : one(value))
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

export function extractFdx(source: string): NormalisedDoc {
  const parser = new XMLParser({
    ignoreAttributes: false,
    // Keep text nodes so a <Text> split across styled runs can be rejoined.
    preserveOrder: false,
    trimValues: false,
  })

  let parsed: unknown
  try {
    parsed = parser.parse(source)
  } catch {
    return { blocks: [], footnotes: [], dropped: ['the file could not be read as Final Draft XML'] }
  }

  const document = (
    parsed as { FinalDraft?: { Content?: { Paragraph?: FdxParagraph | FdxParagraph[] } } }
  ).FinalDraft?.Content?.Paragraph

  const paragraphs: FdxParagraph[] = Array.isArray(document) ? document : document ? [document] : []

  const blocks: Block[] = []
  const dropped = new Set<string>()

  for (const paragraph of paragraphs) {
    const value = fdxText(paragraph.Text)
    if (value.length === 0) continue

    const name = paragraph['@_Type'] ?? 'Action'
    const type = FDX_TYPES[name]
    if (!type) {
      dropped.add('revision marks and production notes')
      continue
    }
    blocks.push(block(type, value))
  }

  return { blocks, footnotes: [], dropped: [...dropped] }
}
