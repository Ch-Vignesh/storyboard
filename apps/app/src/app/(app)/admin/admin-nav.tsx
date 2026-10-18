'use client'

import Link from '@/components/link'
import { usePathname } from 'next/navigation'

/**
 * Decision 0043 (item 2b.7) — the panel's screens, down the side, with the
 * current one marked for the ear as for the eye.
 */
export function AdminNav({ screens }: { screens: ReadonlyArray<{ href: string; label: string }> }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin screens" className="sm:w-40 sm:shrink-0">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] sm:flex-col sm:gap-y-1.5">
        {screens.map((screen) => {
          const current = pathname === screen.href
          return (
            <li key={screen.href}>
              <Link
                href={screen.href}
                aria-current={current ? 'page' : undefined}
                className={current ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'}
              >
                {screen.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
