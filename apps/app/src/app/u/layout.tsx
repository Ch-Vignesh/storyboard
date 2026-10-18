import { SiteHeader } from '@/components/site-header'

/** Phase 14, item 4.1 — profiles and credits pages carry the site header. */
export default function ProfilesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
