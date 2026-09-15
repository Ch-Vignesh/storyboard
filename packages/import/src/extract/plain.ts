import { blocksFromPlainText } from './blocks'
import type { NormalisedDoc } from '../types'

/** `.txt` — paragraphs and nothing else, which is all the format carries. */
export function extractPlainText(source: string): NormalisedDoc {
  return { blocks: blocksFromPlainText(source), footnotes: [], dropped: [] }
}

/**
 * `.rtf` — architecture section 5 says "plain split", and this is what that
 * means in practice: strip the control words and keep the text.
 *
 * RTF is a nest of braces and backslash commands with the prose in between.
 * A full reader would be a project of its own; what a manuscript actually needs
 * is the paragraphs, and `\par` marks those. Everything else — fonts, colour
 * tables, style sheets, embedded objects — is exactly what FR-3.7 says is
 * dropped anyway, so dropping it is the specified behaviour and not a shortcut.
 */
export function extractRtf(source: string): NormalisedDoc {
  const dropped: string[] = []

  let cleaned = source
  // Groups that exist to describe the file rather than its content. `\*` marks
  // a destination a reader is allowed to skip entirely, which is the standard's
  // own way of saying "not prose".
  const before = cleaned.length
  cleaned = cleaned.replaceAll(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gu, '')
  cleaned = cleaned.replaceAll(
    /\{\\(?:fonttbl|colortbl|stylesheet|info|pict|header|footer)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gu,
    '',
  )
  if (cleaned.length !== before) dropped.push('fonts, colours and styles')

  // Escaped characters, then paragraph and line breaks, then the rest.
  cleaned = cleaned
    .replaceAll(/\\'([0-9a-f]{2})/giu, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replaceAll(/\\u(-?\d+)\s?\??/gu, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10) & 0xffff),
    )
    .replaceAll(/\\(?:par|line|page)\b/gu, '\n\n')
    .replaceAll(/\\tab\b/gu, ' ')
    .replaceAll(/\\[a-z]+-?\d*\s?/giu, '')
    .replaceAll(/[{}]/gu, '')
    .replaceAll(/\\\n/gu, '\n')

  return { blocks: blocksFromPlainText(cleaned), footnotes: [], dropped }
}
