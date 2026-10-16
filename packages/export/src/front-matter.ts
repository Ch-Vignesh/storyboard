import type { Manuscript } from './types'

/**
 * FR-14.3 — the contributors page and the source line, in every export.
 *
 * "This is not removable from within the product" is the requirement, and the
 * way to honour it is to make every exporter build its front matter from one
 * function rather than each assembling its own. A format that forgot the
 * contributors page would be a bug in one place, not a policy in four.
 *
 * It is worth saying what this does *not* do: it does not stop anybody deleting
 * a page from the file afterwards. Nothing could. What it does is make the
 * credit travel by default, so that leaving it out is a deliberate act by a
 * person rather than an accident of the software.
 */

export type FrontMatterLine = { text: string; emphasis?: boolean }

export function frontMatterLines(manuscript: Manuscript): FrontMatterLine[] {
  const lines: FrontMatterLine[] = [
    { text: manuscript.title, emphasis: true },
    { text: `by ${manuscript.author}` },
  ]
  const origin = originLine(manuscript)
  if (origin) lines.push({ text: origin })

  if (manuscript.contributors.length > 0) {
    lines.push({ text: '' })
    lines.push({ text: 'With contributions from', emphasis: true })
    for (const contributor of manuscript.contributors) {
      lines.push({ text: `${contributor.name} — ${contributor.role}` })
    }
  }

  lines.push({ text: '' })
  lines.push({ text: sourceLine(manuscript) })

  if (manuscript.rightsNote && manuscript.rightsNote.trim().length > 0) {
    lines.push({ text: '' })
    // FR-14.5 — shown exactly as the author wrote it, with no endorsement.
    lines.push({ text: manuscript.rightsNote.trim() })
  }

  return lines
}

/**
 * FR-10.4 — where a spin-off came from, said under its author in every
 * format. An exported spin-off named only its own author until the 2026-10-16
 * spec review, so the words of the story it was taken from left without it.
 */
export function originLine(manuscript: Manuscript): string | null {
  const origin = manuscript.spunOffFrom
  if (!origin) return null
  const by = origin.author ? ` by ${origin.author}` : ''
  const at = origin.url ? ` — ${origin.url}` : ''
  return `Spun off from “${origin.title}”${by}${at}`
}

/** The footer line. Every page of the PDF carries it; other formats carry it once. */
export function sourceLine(manuscript: Manuscript): string {
  return `Written on Draftboard — ${manuscript.sourceUrl}`
}

/** A file name a writer will recognise in their downloads folder. */
export function fileNameFor(title: string, extension: string): string {
  const stem =
    title
      .normalize('NFKD')
      .replaceAll(/[^\w\s-]+/gu, '')
      .trim()
      .replaceAll(/\s+/gu, '-')
      .slice(0, 80)
      .toLowerCase() || 'manuscript'
  return `${stem}.${extension}`
}
