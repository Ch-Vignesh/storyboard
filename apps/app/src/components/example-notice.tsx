import { caller } from '@/trpc/server'

import { ExampleLabel } from './example-label'

/**
 * FR-15.3 (phase 14, item 7.7) — under the site header on every page of a
 * seeded story but the reader, which says it in its own header: a request,
 * a suggestion, the composer, the comparison, contributors, lineage and the
 * rest. Browse sends helpers straight to a request page, which said nothing.
 *
 * Asked with the story's own read right, so it says nothing about a story
 * this person may not read; the page under it decides the 404. Any failure
 * leaves the page without the line rather than without the page.
 */
export async function ExampleNotice({ slug }: { slug: string }) {
  const example = await caller.storyboard.isExample({ slug }).catch(() => false)
  if (!example) return null
  return (
    <div className="border-b border-ochre/25 bg-ochre-wash/50">
      <p className="mx-auto max-w-6xl px-6 py-1.5 text-[12.5px] text-ink-soft">
        <ExampleLabel className="mr-2" />
        An example story from the public domain, here to show how helping works.
      </p>
    </div>
  )
}
