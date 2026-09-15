'use client'

import type { Proposal } from '@storyboard/import'
import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { useState } from 'react'

export type OutlineSection = { from: number; to: number }
export type OutlineChapter = { title: string; sections: OutlineSection[] }
export type Outline = OutlineChapter[]

/**
 * FR-3.2 and FR-3.5 — the review screen, which is the point of the whole
 * feature.
 *
 * Detection is a list of rules and will be wrong on some manuscripts. That is
 * acceptable only because this screen exists: the writer sees every proposed
 * boundary with the first twelve words after it, and can move, add or remove
 * any of them before a word is saved. The measure of success is not how often
 * detection is right — it is how fast a wrong guess is corrected.
 *
 * Four operations, all of them reversible because nothing is written yet:
 *
 * - **Join** a section to the one before it, when a break was imagined.
 * - **Split** a section, when a break was missed.
 * - **Start a chapter** at a section, when two chapters were read as one.
 * - **Join a chapter** to the one before it, when one was read as two.
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

  /** Every section in reading order, with where it sits in the outline. */
  const flat = outline.flatMap((chapter, chapterIndex) =>
    chapter.sections.map((section, sectionIndex) => ({ chapterIndex, sectionIndex, section })),
  )

  const previewFor = (section: OutlineSection): string => {
    // The proposal's own previews are per proposed section; after an edit the
    // ranges differ, so the preview is matched on where the section starts.
    for (const chapter of proposal.chapters) {
      for (const candidate of chapter.sections) {
        if (candidate.from === section.from) return candidate.preview
      }
    }
    // A section split by hand starts mid-way through a proposed one; the honest
    // answer is the proposed section's own opening, which is where it came from.
    let best = ''
    for (const chapter of proposal.chapters) {
      for (const candidate of chapter.sections) {
        if (candidate.from <= section.from && section.from <= candidate.to) best = candidate.preview
      }
    }
    return best
  }

  const wordsFor = (section: OutlineSection): number => {
    // Blocks are not on the client, so length is estimated from the proposal's
    // own counts, in proportion to how much of the original range this covers.
    for (const chapter of proposal.chapters) {
      for (const candidate of chapter.sections) {
        if (candidate.from === section.from && candidate.to === section.to)
          return candidate.wordCount
        if (candidate.from <= section.from && section.to <= candidate.to) {
          const span = candidate.to - candidate.from + 1
          const part = section.to - section.from + 1
          return Math.round((candidate.wordCount * part) / Math.max(span, 1))
        }
      }
    }
    return 0
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

  const splitInHalf = (chapterIndex: number, sectionIndex: number) => {
    const next = structuredClone(outline)
    const section = next[chapterIndex]?.sections[sectionIndex]
    if (!section || section.to <= section.from) return

    const middle = Math.floor((section.from + section.to) / 2)
    const tail = { from: middle + 1, to: section.to }
    section.to = middle
    next[chapterIndex]?.sections.splice(sectionIndex + 1, 0, tail)
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
                {chapter.sections.map((section, sectionIndex) => (
                  <li key={`${String(section.from)}-${String(section.to)}`} className="px-3 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="min-w-0 flex-1 font-manuscript text-[14.5px] leading-relaxed text-ink">
                        {previewFor(section) || <span className="text-ink-faint">(no words)</span>}
                      </p>
                      <span className="shrink-0 text-[12px] text-ink-faint tabular-nums">
                        ~{wordsFor(section).toLocaleString('en-GB')} words
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {sectionIndex > 0 || chapterIndex > 0 ? (
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => splitInHalf(chapterIndex, sectionIndex)}
                        >
                          Split this in two
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
                  </li>
                ))}
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
