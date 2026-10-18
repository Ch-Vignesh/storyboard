import { SiteHeader } from '@/components/site-header'

/**
 * Phase 14, item 4.1 — the pages anyone may read without an account: the
 * rules, contact, privacy, terms and unsubscribe. They carry the site header
 * so that a member who lands on one is not stranded, and a guest sees the
 * way in.
 */
export default function PublicPagesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
