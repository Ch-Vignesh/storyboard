import { ExampleNotice } from '@/components/example-notice'
import { SiteHeader } from '@/components/site-header'

/**
 * Phase 14, item 4.1 — every story page that is not the reader: contents,
 * settings, comparison, contributors, lineage, versions, export and
 * co-authors (the help pages, beside this group, have the same layout). They
 * were dead ends with no header; now they share the site's. The reader
 * (`../page.tsx` and the chapter and section addresses) stays outside this
 * group on purpose: it has its own header, with the account end of this one
 * inside it.
 */
export default async function StoryPagesLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  return (
    <>
      <SiteHeader />
      {/* FR-15.3 (item 7.7) — a seeded story says so on every page of it. */}
      <ExampleNotice slug={slug} />
      {children}
    </>
  )
}
