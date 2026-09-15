'use client'

import { useEffect } from 'react'

/**
 * The scroll effects, for browsers that cannot do them in CSS.
 *
 * The page's motion is written as scroll-driven CSS animations, which run off
 * the main thread and cost nothing. Chromium has shipped them for a while;
 * Firefox and older Safari have not, and there they simply do not happen — the
 * page is correct and completely static, which is indistinguishable from a bug
 * if what you were expecting was parallax.
 *
 * So this is the fallback, and it is deliberately *only* a fallback:
 *
 * - If `animation-timeline: view()` works, this does nothing at all and detaches
 *   immediately. The CSS is better and it stays in charge.
 * - If the visitor asked for reduced motion, this does nothing. That preference
 *   exists because this kind of movement makes some people ill, and Windows
 *   turns it on whenever "Animation effects" is off.
 * - If neither applies, it drives the same effects from one `requestAnimationFrame`
 *   loop that only does work on frames where the page actually moved.
 *
 * Nothing is hidden until this mounts. The `js-motion` class on the root element
 * is what turns the reveal's resting state on, so a visitor with no JavaScript
 * sees a complete page rather than a permanently faded one.
 */

/** What moves, and how far, per unit of progress through the viewport. */
const LAYERS: Array<{ selector: string; distance: number; rotate?: number; axis?: 'x' | 'y' }> = [
  { selector: '.drift', distance: 24 },
  { selector: '.drift-tiny', distance: 11 },
  { selector: '.drift-far', distance: 62, rotate: 4 },
  { selector: '.sway', distance: 22, rotate: 5, axis: 'x' },
  { selector: '.tilt', distance: 10, rotate: 10 },
]

export function Motion() {
  useEffect(() => {
    // The CSS can do it. Leave it alone — it is smoother and free.
    if (CSS.supports('animation-timeline', 'view()')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    root.classList.add('js-motion')

    // ── Reveals. One observer, and each element is released once.
    const revealed = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          revealed.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    for (const el of document.querySelectorAll('.rise, .rise-left, .rise-right')) {
      revealed.observe(el)
    }

    // ── Parallax. Collected once; the loop only reads and writes transforms.
    const moving = LAYERS.flatMap(({ selector, distance, rotate, axis }) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map((el) => ({
        el,
        distance,
        rotate: rotate ?? 0,
        axis: axis ?? 'y',
      })),
    )
    const progressBar = document.querySelector<HTMLElement>('.progress')

    let frame = 0
    let last = -1

    const paint = () => {
      frame = 0
      const viewport = window.innerHeight

      for (const { el, distance, rotate, axis } of moving) {
        const box = el.getBoundingClientRect()
        // -1 when the element is just below the fold, 1 when just above it.
        const centre = (box.top + box.height / 2 - viewport / 2) / viewport
        const t = Math.max(-1, Math.min(1, centre))
        const shift = (t * distance).toFixed(2)
        const turn = rotate ? ` rotate(${(t * rotate).toFixed(2)}deg)` : ''
        el.style.transform =
          axis === 'x' ? `translateX(${shift}px)${turn}` : `translateY(${shift}px)${turn}`
      }

      if (progressBar) {
        const total = document.documentElement.scrollHeight - viewport
        progressBar.style.transform = `scaleX(${total > 0 ? (window.scrollY / total).toFixed(4) : '0'})`
      }
    }

    const onScroll = () => {
      // One paint per frame, and none at all if the page has not moved.
      if (frame || window.scrollY === last) return
      last = window.scrollY
      frame = requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      revealed.disconnect()
      root.classList.remove('js-motion')
    }
  }, [])

  return null
}
