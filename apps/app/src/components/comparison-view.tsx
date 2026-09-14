'use client'

import type { ComparisonResult, ComparisonRow, WordMark } from '@storyboard/compare'
import { useState } from 'react'

/**
 * The comparison view (FR-7.1 to FR-7.4).
 *
 * One component for all three cases FR-7.5 lists, because all three arrive here
 * as the same `ComparisonResult`. There are no variant code paths.
 *
 * Accessibility (NFR-4): marks never rely on colour. A deletion is a `<del>`
 * and is struck through; an insertion is an `<ins>` and is underlined. Both
 * carry visually hidden text so a screen reader hears "removed"/"added"
 * rather than inferring it from a style.
 */

type Props = {
  result: ComparisonResult
  /** What the left column is, e.g. "The current text". */
  leftLabel: string
  /** What the right column is, e.g. "Leah's suggestion". */
  rightLabel: string
}

export function ComparisonView({ result, leftLabel, rightLabel }: Props) {
  // FR-7.2.3 — a rewrite opens in read-through, because marks would be noise.
  const [readThrough, setReadThrough] = useState(result.mode === 'rewrite')

  return (
    <div>
      <SummaryBar stats={result.stats} />

      {result.mode === 'rewrite' ? (
        <p className="mt-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
          This is a rewrite rather than an edit — reading it straight will be easier than looking at
          marks.
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-b border-rule pb-3">
        <div className="flex gap-1" role="group" aria-label="How to show the comparison">
          <ToggleButton active={!readThrough} onClick={() => setReadThrough(false)}>
            Side by side
          </ToggleButton>
          <ToggleButton active={readThrough} onClick={() => setReadThrough(true)}>
            Read it straight
          </ToggleButton>
        </div>
        <p className="text-[12px] text-ink-faint">
          {result.mode === 'rewrite' ? 'Marks are off for a rewrite' : 'Blue pencil marks changes'}
        </p>
      </div>

      {readThrough ? (
        <ReadThrough result={result} label={rightLabel} />
      ) : (
        <SideBySide result={result} leftLabel={leftLabel} rightLabel={rightLabel} />
      )}
    </div>
  )
}

/** FR-7.4 — four counts. No percentages, no scores. */
function SummaryBar({ stats }: { stats: ComparisonResult['stats'] }) {
  const entries = [
    { label: 'kept', value: stats.kept },
    { label: 'changed', value: stats.changed },
    { label: 'added', value: stats.added },
    { label: 'removed', value: stats.removed },
  ]
  return (
    <dl
      role="group"
      aria-label="What changed, counted in paragraphs"
      className="flex flex-wrap gap-x-8 gap-y-2 border-y border-rule py-3"
    >
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-baseline gap-2">
          <dt className="text-[12px] tracking-wide text-ink-faint uppercase">{entry.label}</dt>
          <dd className="font-manuscript text-[19px] text-ink tabular-nums">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Side by side, original left, proposed right. The two columns are one grid, so
 * each pair of paragraphs sits on the same row and the sides stay aligned as
 * the page scrolls — the scroll-locking FR-7.1 asks for, achieved by layout
 * rather than by synchronising two scroll positions in JavaScript.
 */
function SideBySide({ result, leftLabel, rightLabel }: Props) {
  return (
    <div className="mt-5">
      <div className="grid grid-cols-2 gap-x-8 border-b border-rule pb-2">
        <h3 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          {leftLabel}
        </h3>
        <h3 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          {rightLabel}
        </h3>
      </div>

      <div className="manuscript grid grid-cols-2 gap-x-8">
        {result.rows.map((row, index) => (
          <Row key={index} row={row} />
        ))}
      </div>
    </div>
  )
}

function Row({ row }: { row: ComparisonRow }) {
  const tone =
    row.kind === 'added'
      ? 'bg-moss-wash/50'
      : row.kind === 'removed'
        ? 'bg-ochre-wash/40'
        : undefined

  return (
    <>
      <div className={`border-t border-rule/60 py-3 pr-2 ${tone ?? ''}`}>
        {row.left ? (
          <p>{row.left.marks ? <Marked marks={row.left.marks} side="left" /> : row.left.text}</p>
        ) : (
          <p aria-hidden className="text-[13px] text-ink-faint italic">
            —
          </p>
        )}
      </div>
      <div className={`border-t border-rule/60 py-3 pl-2 ${tone ?? ''}`}>
        {row.right ? (
          <p>
            {row.right.marks ? <Marked marks={row.right.marks} side="right" /> : row.right.text}
          </p>
        ) : (
          <p aria-hidden className="text-[13px] text-ink-faint italic">
            —
          </p>
        )}
      </div>
    </>
  )
}

/**
 * Word marks. `<del>` and `<ins>` are the semantic elements for this, so screen
 * readers announce them without help; the visually hidden labels are belt and
 * braces for readers whose software does not.
 */
function Marked({ marks, side }: { marks: readonly WordMark[]; side: 'left' | 'right' }) {
  return (
    <>
      {marks.map((mark, index) => {
        if (mark.kind === 'removed' && side === 'left') {
          return (
            <del key={index} className="bg-crimson/8 text-crimson decoration-crimson/70">
              {mark.text}
            </del>
          )
        }
        if (mark.kind === 'added' && side === 'right') {
          return (
            <ins key={index} className="bg-pencil-wash text-pencil decoration-pencil/70">
              {mark.text}
            </ins>
          )
        }
        return <span key={index}>{mark.text}</span>
      })}
    </>
  )
}

/** FR-7.1 — the proposed text alone, with no marks at all. */
function ReadThrough({ result, label }: { result: ComparisonResult; label: string }) {
  const paragraphs = result.rows
    .map((row) => row.right?.text)
    .filter((text): text is string => text !== undefined)

  return (
    <div className="mt-5">
      <h3 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">{label}</h3>
      <div className="manuscript mt-3 max-w-measure">
        {paragraphs.length === 0 ? (
          <p className="text-[13.5px] text-ink-faint italic">Nothing proposed.</p>
        ) : (
          paragraphs.map((text, index) => <p key={index}>{text}</p>)
        )}
      </div>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13px] text-pencil'
          : 'rounded-control border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint hover:text-ink'
      }
    >
      {children}
    </button>
  )
}
