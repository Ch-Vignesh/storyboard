/**
 * Phase 14, items 9.6 and 9.7 — the mark, and the colours it is drawn in, for
 * the places the stylesheet does not reach: an icon or a link preview drawn by
 * `next/og` on the server, and a web app manifest. Both apps draw from here, so
 * a tab, a home screen and a shared link all show the same sheet of paper.
 *
 * The mark is a copy-editor's caret, which means *insert here*: the whole
 * product in one stroke, and the first of the marketing page's marks. Blue
 * pencil on paper, under a line of writing with a gap in it.
 */

/**
 * The palette of `styles/globals.css`, as values: `next/og` and a manifest take
 * a colour, not a CSS variable. `brand.test.ts` holds each one to the theme.
 */
export const PALETTE = {
  paper: '#fbfbf9',
  paperSunk: '#f2f2ee',
  ink: '#11202b',
  inkSoft: '#55636d',
  inkFaint: '#6b757d',
  rule: '#dfe0da',
  pencil: '#2b5ca8',
  ochre: '#a8571b',
} as const

/**
 * The mark's drawing, in a 32-unit square. The static `icon.svg` of each app
 * carries these same paths (the application's icon test checks its own), and
 * `Mark` draws them for the generated icons.
 */
export const MARK = {
  viewBox: '0 0 32 32',
  /** The line of writing: two words, and the gap the caret points into. */
  line: 'M4.5 10h9.5M18 10h9.5',
  /** The caret, drawn by hand rather than ruled: the sides bow a little. */
  caret: 'M7.5 26.5C10.3 22 13.2 17.4 16 12.5c2.8 4.9 5.7 9.5 8.5 14',
} as const

/** The apple-touch-icon's side: what iOS asks for, and scales down from. */
export const APPLE_ICON_SIZE = 180

/** A link preview's picture, at the proportions the large cards use. */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const

/**
 * The mark on its paper, at `size` pixels a side. Paths only: no type to load.
 * `onPaper={false}` leaves the sheet out, for a mark drawn on a page that is
 * paper already.
 */
export function Mark({ size, onPaper = true }: { size: number; onPaper?: boolean }) {
  return (
    <svg width={size} height={size} viewBox={MARK.viewBox} xmlns="http://www.w3.org/2000/svg">
      {onPaper ? <rect width="32" height="32" fill={PALETTE.paper} /> : null}
      <path
        d={MARK.line}
        fill="none"
        stroke={PALETTE.inkFaint}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={MARK.caret}
        fill="none"
        stroke={PALETTE.pencil}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The default link preview: a ruled sheet with the ochre margin rule every
 * exercise book has, the mark, the name and what it is for. Laid out for
 * `next/og`, which reads flexbox and inline styles and nothing else, and
 * written in its built-in face: the product's own faces ship as WOFF2, which
 * it cannot read.
 */
export function ShareCard({ line }: { line: string }) {
  const { width, height } = SHARE_IMAGE_SIZE
  const ruled = Array.from({ length: Math.floor(height / 42) }, (_, index) => 42 * (index + 1))

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: PALETTE.paper,
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {ruled.map((y) => (
          <path key={y} d={`M0 ${String(y)}H${String(width)}`} stroke={PALETTE.rule} />
        ))}
        <path d={`M132 0V${String(height)}`} stroke={PALETTE.ochre} strokeOpacity="0.35" />
      </svg>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 192,
          paddingRight: 96,
          width: '100%',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Mark size={112} onPaper={false} />
          <div
            style={{
              display: 'flex',
              marginLeft: 36,
              fontSize: 76,
              color: PALETTE.ink,
              letterSpacing: '-0.02em',
            }}
          >
            Draftboard
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 48,
            fontSize: 44,
            lineHeight: 1.3,
            color: PALETTE.inkSoft,
          }}
        >
          {line}
        </div>
      </div>
    </div>
  )
}
