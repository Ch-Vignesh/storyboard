'use client'

import type { Proposal } from '@storyboard/import'
import { SECTION_REASON_COPY, STRATEGY_COPY } from '@storyboard/import/types'
import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { useState } from 'react'

export type OutlineSection = { from: number; to: number }
export type OutlineChapter = { title: string; sections: OutlineSection[] }
export type Outline = OutlineChapter[]

/** Which section is choosing a paragraph, and for what. */
type Picking = { chapterIndex: number; sectionIndex: number; mode: 'split' | 'move' }

/**
 * FR-3.2 and FR-3.5 — the review screen, which is the point of the whole
 * feature.
 *
 * Detection is a list of rules and will be wrong on some manuscripts. That is
 * acceptable only because this screen exists: the writer sees every proposed
 * boundary with the first twelve words after it, why it was put there, and
 * can move, add or remove any of them before a word is saved. The measure of
 * success is not how often detection is right — it is how fast a wrong guess
 * is corrected.
 *
 * - **Join** a section to the one before it, when a break was imagined.
 * - **Split** a section where the writer says, when a break was missed.
 * - **Move** where a section starts, when a break was put in the wrong place.
 * - **Start a chapter** at a section, when two chapters were read as one.
 * - **Join a chapter** to the one before it, when one was read as two.
 *
 * Splitting always cut in the middle, nothing could move a boundary, and the
 * reason was one phrase for the whole manuscript, until the 2026-10-16 spec
 * review. The paragraph openings that make choosing possible come with the
 * proposal (`Proposal.openings`).
 */
export function BoundaryReview({
  proposal,
  outline,
  onChange,
}: {
  proposal: Proposal
  outline: Outline
  onChange: (next: Outline) => void
}) {
  const [openChapter, setOpenChapter] = useState<number | null>(0)
  const [picking, setPicking] = useState<Picking | null>(null)
  // A proposal saved before the openings existed has none; it can still be
  // joined and split, only not at a chosen paragraph.
  const openings: string[] = proposal.openings ?? []

  /** Every section in reading order, with where it sits in the outline. */
  const flat = outline.flatMap((chapter, chapterIndex) =>
    chapter.sections.map((section, sectionIndex) => ({ chapterIndex, sectionIndex, section })),
  )

  const proposedSections = proposal.chapters.flatMap((chapter) => chapter.sections)

  const previewFor = (section: OutlineSection): string => {
    const exact = proposedSections.find((candidate) => candidate.from === section.from)
    if (exact) return exact.preview
    // A boundary placed by hand: the paragraph it now starts at, if known.
    return (
      openings[section.from] ??
      proposedSections.find(
        (candidate) => candidate.from <= section.from && section.from <= candidate.to,
      )?.preview ??
      ''
    )
  }

  /** FR-3.5 — why this boundary is here, in words. */
  const reasonFor = (section: OutlineSection): string => {
    const proposed = proposedSections.find((candidate) => candidate.from === section.from)
    if (!proposed) return 'where you put it'
    // A proposal saved before reasons were recorded says only that it was proposed.
    return SECTION_REASON_COPY[proposed.reason] ?? 'as proposed'
  }

  /** And for each chapter, which rule found it. */
  const strategyFor = (chapter: OutlineChapter): string => {
    const first = chapter.sections[0]?.from
    const proposed = proposal.chapters.find((candidate) => candidate.sections[0]?.from === first)
    return proposed ? STRATEGY_COPY[proposed.strategy] : 'where you put it'
  }

  const wordsFor = (section: OutlineSection): number => {
    // Blocks are not on the client, so length is estimated from the proposal's
    // own counts, in proportion to how much of the original range this covers.
    let total = 0
    for (const candidate of proposedSections) {
      const start = Math.max(candidate.from, section.from)
      const end = Math.min(candidate.to, section.to)
      if (start > end) continue
      const span = candidate.to - candidate.from + 1
      total += (candidate.wordCount * (end - start + 1)) / Math.max(span, 1)
    }
    return Math.round(total)
  }

  /** Two sections become one. The prose does not move; the boundary goes. */
  const joinSectionWithPrevious = (chapterIndex: number, sectionIndex: number) => {
    const next = structuredClone(outline)
    const chapter = next[chapterIndex]
    if (!chapter) return

    if (sectionIndex > 0) {
      const previous = chapter.sections[sectionIndex - 1]
      const current = chapter.sections[sectionIndex]
      if (!previous || !current) return
      previous.to = current.to
      chapter.sections.splice(sectionIndex, 1)
      onChange(next)
      return
    }

    // The first section of a chapter has no section above it inside this
    // chapter, so joining it means removing the chapter boundary entirely.
    joinChapterWithPrevious(chapterIndex)
  }

  /**
   * This was not a new chapter after all.
   *
   * Every one of its sections continues the chapter above, in order — and the
   * boundary that was wrongly read as a chapter break becomes an ordinary
   * section break, because that is what it was. Moving only the first section
   * would strand the rest as a chapter nobody asked for.
   */
  const joinChapterWithPrevious = (chapterIndex: number) => {
    if (chapterIndex === 0) return
    const next = structuredClone(outline)
    const chapter = next[chapterIndex]
    const above = next[chapterIndex - 1]
    if (!chapter || !above) return

    above.sections.push(...chapter.sections)
    next.splice(chapterIndex, 1)
    onChange(next)
  }

  /** A new section starts at this block, inside the one it is in. */
  const splitAt = (chapterIndex: number, sectionIndex: number, at: number) => {
    const next = structuredClone(outline)
    const section = next[chapterIndex]?.sections[sectionIndex]
    if (!section || at <= section.from || at > section.to) return
    const tail = { from: at, to: section.to }
    section.to = at - 1
    next[chapterIndex]?.sections.splice(sectionIndex + 1, 0, tail)
    setPicking(null)
    onChange(next)
  }

  /** Without openings to choose from: the middle, as it used to be. */
  const splitInHalf = (chapterIndex: number, sectionIndex: number) => {
    const section = outline[chapterIndex]?.sections[sectionIndex]
    if (!section || section.to <= section.from) return
    splitAt(chapterIndex, sectionIndex, Math.floor((section.from + section.to) / 2) + 1)
  }

  /**
   * The boundary before this section moves to this block: the section before
   * it, which may be in the chapter above, ends just before.
   */
  const moveStartTo = (chapterIndex: number, sectionIndex: number, at: number) => {
    const next = structuredClone(outline)
    const position = flat.findIndex(
      (entry) => entry.chapterIndex === chapterIndex && entry.sectionIndex === sectionIndex,
    )
    const before = flat[position - 1]
    const current = next[chapterIndex]?.sections[sectionIndex]
    const previous = before ? next[before.chapterIndex]?.sections[before.sectionIndex] : undefined
    if (!current || !previous || at <= previous.from || at > current.to) return
    previous.to = at - 1
    current.from = at
    setPicking(null)
    onChange(next)
  }

  const startChapterHere = (chapterIndex: number, sectionIndex: number) => {
    if (sectionIndex === 0) return
    const next = structuredClone(outline)
    const chapter = next[chapterIndex]
    if (!chapter) return

    const moved = chapter.sections.splice(sectionIndex)
    next.splice(chapterIndex + 1, 0, {
      title: `Chapter ${String(chapterIndex + 2)}`,
      sections: moved,
    })
    onChange(next)
  }

  const rename = (chapterIndex: number, title: string) => {
    const next = structuredClone(outline)
    const chapter = next[chapterIndex]
    if (!chapter) return
    chapter.title = title
    onChange(next)
  }

  /** The blocks a boundary can be put at, for the section that is choosing. */
  const choicesFor = (target: Picking): number[] => {
    const section = outline[target.chapterIndex]?.sections[target.sectionIndex]
    if (!section) return []
    if (target.mode === 'split') {
      return range(section.from + 1, section.to)
    }
    const position = flat.findIndex(
      (entry) =>
        entry.chapterIndex === target.chapterIndex && entry.sectionIndex === target.sectionIndex,
    )
    const previous = flat[position - 1]?.section
    return previous ? range(previous.from + 1, section.to).filter((at) => at !== section.from) : []
  }

  if (flat.length === 0) {
    return (
      <p className="mt-6 text-[14px] text-ink-soft">
        Nothing was found in that file. It may be empty, or a format it is not.
      </p>
    )
  }

  return (
    <div className="mt-6">
      <ol className="border-y border-rule">
        {outline.map((chapter, chapterIndex) => (
          <li key={`${String(chapterIndex)}-${String(chapter.sections[0]?.from ?? 0)}`}>
            <div className="flex items-center gap-2 border-b border-rule bg-paper-sunk px-3 py-2">
              <span className="shrink-0 text-[12px] text-ink-faint tabular-nums">
                {chapterIndex + 1}.
              </span>
              <Input
                aria-label={`Name of chapter ${String(chapterIndex + 1)}`}
                value={chapter.title}
                maxLength={200}
                onChange={(event) => rename(chapterIndex, event.target.value)}
                className="h-7 flex-1 border-transparent bg-transparent px-1 text-[14px] focus:border-rule focus:bg-paper"
              />
              {/* FR-3.5 — confidence per boundary, in words, never a number. */}
              <span className="hidden shrink-0 text-[12px] text-ink-faint sm:inline">
                {strategyFor(chapter)}
              </span>
              <span className="shrink-0 text-[12px] text-ink-faint tabular-nums">
                {chapter.sections.length} {chapter.sections.length === 1 ? 'section' : 'sections'}
              </span>
              {chapterIndex > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => joinChapterWithPrevious(chapterIndex)}
                  title="This is not a new chapter"
                >
                  Join to the one above
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={openChapter === chapterIndex}
                onClick={() =>
                  setOpenChapter((current) => (current === chapterIndex ? null : chapterIndex))
                }
              >
                {openChapter === chapterIndex ? 'Hide' : 'Show'}
              </Button>
            </div>

            {openChapter === chapterIndex ? (
              <ol className="divide-y divide-rule">
                {chapter.sections.map((section, sectionIndex) => {
                  const first = chapterIndex === 0 && sectionIndex === 0
                  const here =
                    picking?.chapterIndex === chapterIndex && picking.sectionIndex === sectionIndex
                  return (
                    <li key={`${String(section.from)}-${String(section.to)}`} className="px-3 py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="min-w-0 flex-1 font-manuscript text-[14.5px] leading-relaxed text-ink">
                          {previewFor(section) || (
                            <span className="text-ink-faint">(no words)</span>
                          )}
                        </p>
                        <span className="shrink-0 text-[12px] text-ink-faint tabular-nums">
                          ~{wordsFor(section).toLocaleString('en-GB')} words
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-faint">
                        Starts here {reasonFor(section)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {!first ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => joinSectionWithPrevious(chapterIndex, sectionIndex)}
                          >
                            {sectionIndex > 0
                              ? 'Join to the section above'
                              : 'Join to the chapter above'}
                          </Button>
                        ) : null}
                        {section.to > section.from ? (
                          openings.length > 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-expanded={here && picking.mode === 'split'}
                              onClick={() =>
                                setPicking(
                                  here && picking.mode === 'split'
                                    ? null
                                    : { chapterIndex, sectionIndex, mode: 'split' },
                                )
                              }
                            >
                              Split this…
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => splitInHalf(chapterIndex, sectionIndex)}
                            >
                              Split this in two
                            </Button>
                          )
                        ) : null}
                        {!first && openings.length > 0 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={here && picking.mode === 'move'}
                            onClick={() =>
                              setPicking(
                                here && picking.mode === 'move'
                                  ? null
                                  : { chapterIndex, sectionIndex, mode: 'move' },
                              )
                            }
                          >
                            Move where it starts…
                          </Button>
                        ) : null}
                        {sectionIndex > 0 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startChapterHere(chapterIndex, sectionIndex)}
                          >
                            A new chapter starts here
                          </Button>
                        ) : null}
                      </div>

                      {here ? (
                        <div className="mt-3 border-l-2 border-pencil pl-3">
                          <p className="text-[12.5px] text-ink-soft">
                            {picking.mode === 'split'
                              ? 'Where does the new section start?'
                              : 'Where should this section start?'}
                          </p>
                          <ol
                            aria-label={
                              picking.mode === 'split'
                                ? 'Paragraphs to start a new section at'
                                : 'Paragraphs this section could start at'
                            }
                            className="mt-2 max-h-72 space-y-0.5 overflow-y-auto"
                          >
                            {choicesFor(picking).map((at) => (
                              <li key={at}>
                                <button
                                  type="button"
                                  className={
                                    at < section.from
                                      ? 'w-full rounded-control px-2 py-1 text-left text-[13px] text-ink-faint hover:bg-pencil-wash hover:text-ink'
                                      : 'w-full rounded-control px-2 py-1 text-left text-[13px] text-ink-soft hover:bg-pencil-wash hover:text-ink'
                                  }
                                  onClick={() =>
                                    picking.mode === 'split'
                                      ? splitAt(chapterIndex, sectionIndex, at)
                                      : moveStartTo(chapterIndex, sectionIndex, at)
                                  }
                                >
                                  {(openings[at] ?? '').length > 0
                                    ? openings[at]
                                    : '(an empty line)'}
                                </button>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[12.5px] text-ink-faint">
        {outline.length} {outline.length === 1 ? 'chapter' : 'chapters'}, {flat.length}{' '}
        {flat.length === 1 ? 'section' : 'sections'}. You can also change any of this after it is
        in.
      </p>
    </div>
  )
}

/** The whole numbers from `from` to `to`, both included. */
function range(from: number, to: number): number[] {
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, index) => from + index)
}
