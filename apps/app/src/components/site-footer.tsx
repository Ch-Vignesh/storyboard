'use client'

import Link from '@/components/link'
import { usePathname } from 'next/navigation'

/**
 * Phase 14, item 2.6 — the footer, on every page but the editor, whose chrome
 * is the page's own. The links are the ones a stranger or a lawyer looks for:
 * the rules, the two legal pages, a person to write to, and the source, since
 * writers being asked to trust the place with unpublished work may read it.
 */
export function SiteFooter() {
  const pathname = usePathname()
  if (pathname.endsWith('/edit')) return null

  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-6 gap-y-2 px-6 py-8 text-[13px] text-ink-faint">
        <span className="font-manuscript text-[15px] font-medium text-ink">Draftboard</span>
        <Link href="/rules" className="hover:text-ink hover:underline">
          Rules
        </Link>
        <Link href="/privacy" className="hover:text-ink hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-ink hover:underline">
          Terms
        </Link>
        <Link href="/contact" className="hover:text-ink hover:underline">
          Contact
        </Link>
        <a
          href="https://github.com/Ch-Vignesh/storyboard"
          className="hover:text-ink hover:underline"
        >
          Source code
        </a>
      </div>
    </footer>
  )
}
