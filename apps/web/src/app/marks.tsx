/**
 * The clip art: proof-correction marks, and the furniture of a working draft.
 *
 * **Why these and not illustrations.** A marketing page for a writing product
 * reaches for quills and open books, and both are about *reading*. This product
 * is about a manuscript in the middle of being fixed — so the vocabulary is the
 * one a copy-editor uses in a margin, which nothing else on the internet looks
 * like and which says what the product does without a caption.
 *
 * The caret means *insert here*, which is the whole product in one mark.
 * The stet dots mean *let it stand* — an author passing on a suggestion.
 * The transpose curve means *swap these two*, the smallest possible edit.
 *
 * **Why they are cheap.** Every one is a handful of path commands, inline, with
 * no image request and no library. The whole file is smaller than one icon font
 * would be, and it inherits `currentColor`, so a mark is whatever colour the
 * thing it sits beside is — which is what makes it work in both themes without
 * a single duplicated value.
 *
 * All of it is `aria-hidden`. A screen reader that announced "caret" beside a
 * heading would be reading the paper, not the writing.
 */

type MarkProps = { className?: string }

/** Shared: hand-drawn rather than geometric — round caps, no perfect corners. */
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * ∧ — insert here. The mark a copy-editor puts under the line at the point
 * where something is missing, which is precisely what an open request is.
 */
export function Caret({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 20" className={className} aria-hidden focusable="false">
      <path
        {...STROKE}
        strokeWidth="1.6"
        d="M2.5 17.2C6 12 9 7.6 11.8 3.2c2.6 4.6 5.6 9.2 9.4 14"
      />
      <path {...STROKE} strokeWidth="1.4" d="M11.9 3.4V0.8" opacity="0.55" />
    </svg>
  )
}

/**
 * Stet — "let it stand". Dots under a word the editor had struck out and the
 * author wants back. FR-6.10's pass, in the notation it was invented for.
 */
export function Stet({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 44 12" className={className} aria-hidden focusable="false">
      <path
        {...STROKE}
        strokeWidth="1.4"
        d="M2 4.6c8.4-1.5 17.6-1.2 26 .4 4.2.8 8 1 14 .2"
        opacity="0.5"
      />
      {[5, 12, 19, 26, 33, 40].map((x, index) => (
        <circle
          key={x}
          cx={x}
          cy={9.4}
          r="1.05"
          fill="currentColor"
          opacity={0.85 - index * 0.06}
        />
      ))}
    </svg>
  )
}

/** ∽ — transpose. Two words in the wrong order, and the smallest edit there is. */
export function Transpose({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 40 16" className={className} aria-hidden focusable="false">
      <path
        {...STROKE}
        strokeWidth="1.5"
        d="M3 11c0-5 6.4-7.4 9.6-3.6 3 3.6 6.2 7 9.8 4.4 3.4-2.4 1.6-7.6-2-7.4"
      />
      <path {...STROKE} strokeWidth="1.4" d="M20.4 4.4l-1.8 1.4 2 1.3" />
    </svg>
  )
}

/**
 * The deletion loop — a struck word with the editor's curl at the end. Drawn
 * once across the page's one "what this is not" section, where it belongs.
 */
export function Delete({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 52 18" className={className} aria-hidden focusable="false">
      <path {...STROKE} strokeWidth="1.5" d="M3 10.6c9-2.2 22-3.4 36-2.6" />
      <path
        {...STROKE}
        strokeWidth="1.5"
        d="M39 8c4.4-.2 7.6 1 8.6 3.2.9 2-.5 3.8-2.4 3.4-1.7-.4-2.2-2.4-.6-3.8 1.4-1.2 3.4-1.9 5.4-2"
      />
    </svg>
  )
}

/** ¶ — a new paragraph begins. The oldest editing mark still in daily use. */
export function Pilcrow({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 18 22" className={className} aria-hidden focusable="false">
      <path {...STROKE} strokeWidth="1.5" d="M12.6 2.2v18M8.4 2.2v18" />
      <path {...STROKE} strokeWidth="1.5" d="M8.4 2.2H6.2a4.1 4.1 0 0 0 0 8.2h2.2M12.6 2.2h3" />
    </svg>
  )
}

/**
 * A paperclip, at the angle one actually sits at. Holds the specimen to the
 * page — the small lie that the thing below it is a sheet rather than a div.
 */
export function Paperclip({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 28 44" className={className} aria-hidden focusable="false">
      <path
        {...STROKE}
        strokeWidth="1.7"
        d="M19.6 12.2v18.4a6.3 6.3 0 0 1-12.6 0V10.4a4 4 0 0 1 8 0v19.8a1.9 1.9 0 0 1-3.8 0V13.4"
      />
    </svg>
  )
}

/**
 * A ring of cold coffee. Every draft anybody has ever printed has one, and it
 * is the single least digital thing that can be drawn in two circles.
 */
export function CoffeeRing({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden focusable="false">
      <circle {...STROKE} strokeWidth="2.4" cx="48" cy="48" r="35" opacity="0.55" />
      <circle {...STROKE} strokeWidth="1.1" cx="49.5" cy="46.5" r="39.5" opacity="0.3" />
      <path {...STROKE} strokeWidth="2" d="M17 42c4 1.6 9 2.2 13 1.4" opacity="0.4" />
    </svg>
  )
}

/**
 * A pen nib, with its slit and vent. Not a quill: this product is about a
 * manuscript being worked on now, and a quill would date it by four centuries.
 */
export function Nib({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 22 34" className={className} aria-hidden focusable="false">
      <path
        {...STROKE}
        strokeWidth="1.5"
        d="M11 33.2 2.6 13.4C1.4 10.6 4 2.2 11 1.4c7 .8 9.6 9.2 8.4 12l-8.4 19.8Z"
      />
      <path {...STROKE} strokeWidth="1.4" d="M11 33.2V17.6" />
      <circle {...STROKE} strokeWidth="1.4" cx="11" cy="14.2" r="2.6" />
    </svg>
  )
}

/**
 * Binding thread — the stitch down the spine of a sewn signature. Used as a
 * section divider, because that is structurally what it is: the place two
 * gatherings of pages are joined.
 */
export function Stitch({ className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 240 8"
      className={className}
      aria-hidden
      focusable="false"
      preserveAspectRatio="none"
    >
      <path
        {...STROKE}
        strokeWidth="1.3"
        strokeDasharray="14 9"
        d="M0 4.2c40-2.4 80-2.4 120 0s80 2.4 120 0"
        opacity="0.75"
      />
    </svg>
  )
}

/**
 * A folded page corner. Sits at the top-right of the page and turns very
 * slightly as you scroll, which is the only motion here that touches a shape
 * rather than moving one.
 */
export function PageCorner({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path {...STROKE} strokeWidth="1.4" d="M63 1 1 63" opacity="0.28" />
      <path {...STROKE} strokeWidth="1.5" d="M63 1 63 40 24 40Z" opacity="0.5" />
      <path {...STROKE} strokeWidth="1.3" d="M63 40 44 21" opacity="0.35" />
    </svg>
  )
}

/**
 * Punched holes down the left edge, as a loose-leaf draft has. Anchors the
 * contents rail to the fiction that the page is paper.
 */
export function PunchHoles({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 16 220" className={className} aria-hidden focusable="false">
      {[26, 110, 194].map((y) => (
        <circle key={y} {...STROKE} strokeWidth="1.3" cx="8" cy={y} r="4.6" opacity="0.55" />
      ))}
    </svg>
  )
}

/**
 * A marker ribbon, tucked into the last section. The one piece of art here
 * that is filled rather than drawn, because a ribbon is cloth and everything
 * else on the page is ink.
 */
export function Ribbon({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 22 74" className={className} aria-hidden focusable="false">
      <path d="M0 0h22v62l-11-8-11 8Z" fill="currentColor" opacity="0.16" />
      <path {...STROKE} strokeWidth="1.3" d="M0 0h22v62l-11-8-11 8Z" opacity="0.4" />
    </svg>
  )
}
