import type { Example } from './example'

/**
 * A stuck passage and the suggestion that was accepted for it, side by side —
 * the whole product in one object, above the fold, with no explanation needed.
 *
 * **No JavaScript.** The switcher is a radio group, and the panels are shown by
 * `:has()` on the checked input. That buys three things worth more than the
 * convenience of `useState`: it works before hydration and with scripting off,
 * it costs the page nothing to download, and a radio group already has the
 * keyboard behaviour and the screen-reader semantics that a hand-built tab set
 * has to reimplement.
 *
 * Three examples rather than one, and chosen for three different *kinds of
 * stuck* rather than three different books: what a visitor needs to believe is
 * that the product handles their problem, and their problem is a kind.
 */
export function Specimen({ examples }: { examples: Example[] }) {
  return (
    <div className="examples">
      <fieldset className="mt-10 border-0 p-0">
        <legend className="sr-only">Choose an example passage</legend>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((example, index) => (
            <label
              key={example.id}
              htmlFor={`example-${example.id}`}
              className="example-tab min-h-10 cursor-pointer rounded-control border border-rule px-3.5 text-[13px] leading-10 text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            >
              <input
                type="radio"
                name="example"
                id={`example-${example.id}`}
                value={example.id}
                defaultChecked={index === 0}
                className="sr-only"
              />
              {example.label}
            </label>
          ))}
        </div>
      </fieldset>

      {examples.map((example) => (
        <div
          key={example.id}
          data-example={example.id}
          className="example-panel bg-surface mt-3 border border-rule sm:grid-cols-2"
        >
          {/* Ochre is what a stuck point is coloured everywhere else in the product. */}
          <div className="rise-left to-surface flex flex-col gap-3 bg-gradient-to-b from-ochre-wash to-72% p-6">
            <p className="text-[10.5px] tracking-[0.09em] text-ochre uppercase">
              Stuck · {example.kind}
            </p>
            <p className="text-[15px] leading-relaxed text-ink">&ldquo;{example.said}&rdquo;</p>
            <p className="border-ochre-edge border-l-2 pl-4 font-manuscript text-[16px] leading-[1.66] text-ink">
              {example.before}
            </p>
            <p className="text-[12.5px] text-ink-faint">{example.source}</p>
          </div>

          {/* Moss is what an accepted suggestion is coloured everywhere else. */}
          <div className="rise-right to-surface flex flex-col gap-3 border-t border-rule bg-gradient-to-b from-moss-wash to-72% p-6 sm:border-t-0 sm:border-l">
            <p className="text-[10.5px] tracking-[0.09em] text-moss uppercase">Kept</p>
            <p className="text-[15px] leading-relaxed text-ink">&ldquo;{example.note}&rdquo;</p>
            <p className="border-moss-edge border-l-2 pl-4 font-manuscript text-[16px] leading-[1.66] text-ink">
              {example.after}
            </p>
            <p className="text-[12.5px] text-ink-faint">
              Credited permanently, and in every export.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
