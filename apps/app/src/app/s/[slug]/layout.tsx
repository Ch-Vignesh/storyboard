import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'

import { caller } from '@/trpc/server'

/**
 * Phase 14, item 8.7 — a story's address follows its title, and an address
 * from before a retitling moves, permanently, to the one it has now, keeping
 * the rest of the path and the query: a credit line printed in a book, a
 * bookmark or a shared link all still arrive. The current address is told
 * only to someone who may read the story (`storyboard.currentSlug`); anyone
 * else meets the page's own 404.
 */
export default async function StoryAddressLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  const current = await caller.storyboard.currentSlug({ slug }).catch(() => null)
  if (current && current !== slug) {
    const old = `/s/${slug}`
    const asked = (await headers()).get('x-requested-path') ?? old
    // Only ever within this story's own addresses.
    const rest = asked.startsWith(old) ? asked.slice(old.length) : ''
    permanentRedirect(`/s/${current}${rest}`)
  }
  return children
}
