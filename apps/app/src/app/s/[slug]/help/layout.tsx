import { ExampleNotice } from '@/components/example-notice'
import { SiteHeader } from '@/components/site-header'

/**
 * Phase 14, item 4.1 — the help pages (a new request, a request, a
 * suggestion, the composer) carry the site header like the other story
 * pages in `../(story)`. They sit beside that group rather than inside it
 * only because of where they already were; the header is the same.
 */
export default async function HelpPagesLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  return (
    <>
      <SiteHeader />
      {/* FR-15.3 (item 7.7) — where browse sends helpers, above all. */}
      <ExampleNotice slug={slug} />
      {children}
    </>
  )
}
