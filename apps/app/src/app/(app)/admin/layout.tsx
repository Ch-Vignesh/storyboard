import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { screensFor } from '@/lib/admin-screens'

import { AdminNav } from './admin-nav'
import { currentAdminActor } from './current-actor'

/**
 * Decision 0043 (phase 14, item 2b.7) — one frame for the panel: the screens
 * this person may open, down the side. Anyone who may open none gets a 404,
 * as each screen gives on its own (NFR-6): the frame hides nothing the
 * procedures would not refuse.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const screens = screensFor(await currentAdminActor())
  if (screens.length === 0) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href="/" className="hover:text-ink hover:underline">
          Your dashboard
        </Link>
      </nav>
      <div className="sm:flex sm:items-start sm:gap-10">
        <AdminNav screens={screens} />
        <div className="mt-6 min-w-0 flex-1 sm:mt-0">{children}</div>
      </div>
    </div>
  )
}
