/**
 * Checks every seeded excerpt against the edition it names (FR-15.2).
 *
 * The seed library transcribes openings by hand so that `pnpm db:seed` needs no
 * network and is reproducible. That is the right trade, and it has one cost: a
 * transcription can drift from the edition it cites, and a platform whose whole
 * pitch is credit cannot be casual about quoting. This script closes that gap.
 *
 * It fetches each Project Gutenberg edition, normalises both sides to the
 * things that are genuinely the same word — quote shape, dash width, line
 * breaks, whitespace runs — and then requires the excerpt to appear verbatim.
 * It is deliberately strict about letters and deliberately blind to typography:
 * a curly apostrophe is not a misquotation, a changed word is.
 *
 *   pnpm check-excerpts          # every work
 *   pnpm check-excerpts 84 1342  # only these Gutenberg ids
 *
 * Downloads are cached under `node_modules/.cache/`, so a second run is free
 * and Gutenberg is asked once. Exits non-zero if any excerpt does not match,
 * which is what makes it usable in CI once the library stops changing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LIBRARY, type SeedWork } from '../packages/db/prisma/seed/storyboards/library'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const CACHE_DIR = resolve(REPO_ROOT, 'node_modules/.cache/gutenberg')

/** Gutenberg asks bulk readers to identify themselves. This is not bulk, but still. */
const USER_AGENT = 'storyboard-seed-check/1.0 (+https://github.com/vigneshchintha/storyboard)'

/** A courtesy between requests. Twenty-five files is small; hammering is rude. */
const PAUSE_MS = 750

/**
 * Where a plain-text edition lives, in the order the site has used over the
 * years. The first two are the modern paths; the third is the old one, still
 * serving some of the older ebook numbers.
 */
function textUrls(id: string): string[] {
  return [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ]
}

function gutenbergId(work: SeedWork): string | null {
  const match = /\/ebooks\/(\d+)/u.exec(work.source.url)
  return match?.[1] ?? null
}

/**
 * Soft hyphen, zero-width space, zero-width (non-)joiner, byte-order mark —
 * the characters an OCR pass leaves behind.
 *
 * Built from a string rather than written as a regex literal on purpose:
 * Prettier rewrites `\uXXXX` escapes inside a `/u` literal into the characters
 * themselves, and these characters are invisible. The result is a source line
 * nobody can read, review, or retype correctly. A string literal is left alone.
 */
const INVISIBLE = new RegExp('[\\u00AD\\u200B-\\u200D\\uFEFF]', 'gu')

/**
 * Reduce a passage to the part a misquotation would change.
 *
 * Everything removed here is typography that editions disagree about without
 * disagreeing about the text: curly versus straight quotes, em dash versus two
 * hyphens, where a line happens to wrap, the soft hyphens and zero-width
 * characters that survive an OCR pass. What is kept is the letters and the
 * words, lower-cased — so `Chapter I` matching `CHAPTER I` is not a finding,
 * and `a dear sister` standing where `my dear sister` was written is.
 */
function normalise(text: string): string {
  return (
    text
      .normalize('NFKC')
      .replaceAll(/[‘’‚‛′´`]/gu, "'")
      .replaceAll(/[“”„‟″]/gu, '"')
      // An em dash is written as one character in some editions and as two
      // hyphens in others, both meaning the same mark.
      .replaceAll(/[‐-―−]/gu, '-')
      .replaceAll(/-{2,}/gu, '-')
      .replaceAll(/[…]/gu, '...')
      .replaceAll(INVISIBLE, '')
      // Gutenberg marks italics with underscores (`_the_ woman`). That is the
      // edition's way of writing a typeface, not a word, and prose does not
      // otherwise use the character.
      .replaceAll('_', '')
      .replaceAll(/\s+/gu, ' ')
      .toLowerCase()
      .trim()
  )
}

/** Strips Gutenberg's licence header and footer so they cannot match by accident. */
function stripBoilerplate(text: string): string {
  const start = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/iu.exec(text)
  const end = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/iu.exec(text)
  const from = start ? start.index + start[0].length : 0
  const to = end ? end.index : text.length
  return text.slice(from, to)
}

async function fetchEdition(id: string): Promise<string> {
  const cached = resolve(CACHE_DIR, `${id}.txt`)
  try {
    return await readFile(cached, 'utf8')
  } catch {
    // Not cached yet.
  }

  let lastError = 'no URL tried'
  for (const url of textUrls(id)) {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    if (response.ok) {
      const body = await response.text()
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(cached, body, 'utf8')
      await new Promise((done) => setTimeout(done, PAUSE_MS))
      return body
    }
    lastError = `${url} returned ${String(response.status)}`
  }
  throw new Error(lastError)
}

/**
 * Where two passages stop agreeing, in words.
 *
 * A failure that says "does not appear" is a failure somebody has to go and
 * diff by hand. Naming the first word that differs, with what stands on either
 * side of it, usually makes the fix obvious without leaving the terminal.
 */
function firstDivergence(excerpt: string, edition: string): string {
  const words = excerpt.split(' ')
  // The longest leading run of words that still appears in the edition.
  let low = 0
  let high = words.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (edition.includes(words.slice(0, mid).join(' '))) low = mid
    else high = mid - 1
  }

  if (low === 0) return 'the excerpt does not start anywhere in this edition'

  const matched = words.slice(0, low).join(' ')
  const at = edition.indexOf(matched) + matched.length
  return [
    `  matched up to:  ...${words.slice(Math.max(0, low - 9), low).join(' ')}`,
    `  seed then has:  ${words.slice(low, low + 9).join(' ')}...`,
    `  edition has:    ${edition.slice(at, at + 70).trim()}...`,
  ].join('\n')
}

type Failure = { work: string; section: number; detail: string }

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2))
  const works = only.size
    ? LIBRARY.filter((work) => only.has(gutenbergId(work) ?? ''))
    : [...LIBRARY]

  if (!works.length) {
    console.error('No works matched. Pass Gutenberg ids, or no arguments for all of them.')
    process.exitCode = 1
    return
  }

  const failures: Failure[] = []
  let checked = 0
  let unreachable = 0

  for (const work of works) {
    const id = gutenbergId(work)
    if (!id) {
      failures.push({
        work: work.title,
        section: -1,
        detail: `  source URL is not a Gutenberg ebook: ${work.source.url}`,
      })
      continue
    }

    let edition: string
    try {
      edition = normalise(stripBoilerplate(await fetchEdition(id)))
    } catch (error) {
      // Being unable to reach Gutenberg is not the same as a misquotation, and
      // conflating the two would make the script cry wolf on a bad train.
      console.warn(`?  ${work.title} — could not fetch: ${String(error)}`)
      unreachable += 1
      continue
    }

    const bad: number[] = []
    work.chapter.sections.forEach((section, index) => {
      checked += 1
      const wanted = normalise(section)
      if (edition.includes(wanted)) return
      bad.push(index)
      failures.push({ work: work.title, section: index, detail: firstDivergence(wanted, edition) })
    })

    const count = work.chapter.sections.length
    console.warn(
      bad.length
        ? `x  ${work.title} — ${String(bad.length)} of ${String(count)} sections do not match`
        : `ok ${work.title} — ${String(count)} sections`,
    )
  }

  console.warn(
    `\n${String(checked)} excerpts checked across ${String(works.length - unreachable)} works.`,
  )

  if (failures.length) {
    console.warn(`\n${String(failures.length)} did not match the edition they cite:\n`)
    for (const failure of failures) {
      console.warn(`${failure.work}, section ${String(failure.section + 1)}:`)
      console.warn(failure.detail)
      console.warn('')
    }
    process.exitCode = 1
    return
  }

  if (unreachable) {
    console.warn(
      `${String(unreachable)} works could not be fetched; nothing is claimed about them.`,
    )
    process.exitCode = 1
    return
  }

  console.warn('Every seeded excerpt appears verbatim in the edition it names.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
