'use client'

import { useEffect, useState } from 'react'

import { SECTIONS } from './example'

/**
 * The contents rail, and the page's only other piece of script.
 *
 * The product's reader has one of these, so the marketing page does too — and
 * on a page this long it is real navigation rather than decoration. It marks
 * where you are rather than merely listing where you could go, which is the
 * difference between a contents list and a table of contents.
 *
 * It renders complete and usable before the observer ever fires; the observer
 * only adds the highlight.
 */
export function ContentsRail() {
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id)
        }
      },
      // Fires when a section reaches the upper third, which is where somebody
      // reading is actually looking.
      { rootMargin: '-25% 0px -65% 0px' },
    )

    for (const section of SECTIONS) {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <nav aria-label="Contents" className="hidden lg:sticky lg:top-10 lg:block">
      <p className="mb-3.5 text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">Contents</p>
      <ol className="flex flex-col gap-px">
        {SECTIONS.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id}
              className={
                current === section.id
                  ? '-ml-2.5 grid grid-cols-[1.35rem_1fr] gap-x-1.5 border-l-2 border-pencil py-1.5 pl-2.5 text-[12.5px] leading-tight text-ink'
                  : '-ml-2.5 grid grid-cols-[1.35rem_1fr] gap-x-1.5 border-l-2 border-transparent py-1.5 pl-2.5 text-[12.5px] leading-tight text-ink-faint transition-colors hover:text-ink'
              }
            >
              <span className="tabular-nums">{index + 1}.</span>
              <span>{section.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
