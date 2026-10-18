import { SiteHeader } from '@/components/site-header'

/**
 * Phase 14, item 4.1 — the help pages (a new request, a request, a
 * suggestion, the composer) carry the site header like the other story
 * pages in `../(story)`. They sit beside that group rather than inside it
 * only because of where they already were; the header is the same.
 */
export default function HelpPagesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
