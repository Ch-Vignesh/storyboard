import { SiteHeader } from '@/components/site-header'

/**
 * Phase 14, item 4.1 — the editor and the history of a section get the site
 * header; the section's reading address beside them (`../page.tsx`) is the
 * reader, and keeps its own.
 */
export default function SectionToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
