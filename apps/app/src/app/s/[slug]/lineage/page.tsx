import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import { nameOf } from '@/lib/people'
import { caller } from '@/trpc/server'

import { SpinOffButton } from './spin-off-button'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Where this story came from' }

const DATE = { day: 'numeric', month: 'long', year: 'numeric' } as const

/** FR-10.5 and FR-10.6 — the chain behind a storyboard, and the ones ahead of it. */
export default async function LineagePage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard } = data
  const session = await auth()

  const [lineage, spinOffs] = await Promise.all([
    caller.spinOff.lineage({ storyboardId: storyboard.id }),
    caller.spinOff.listFor({ storyboardId: storyboard.id }),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Where this story came from
      </h1>

      {/* ── Ancestors (FR-10.5) */}
      <section className="mt-8">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Spun off from
        </h2>
        {lineage.ancestors.length === 0 ? (
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            {storyboard.title} is nobody&rsquo;s spin-off. It started here.
          </p>
        ) : (
          <>
            <ol className="mt-3 space-y-3 border-l-2 border-rule pl-4">
              {lineage.ancestors.map((ancestor) => (
                <li key={ancestor.id} className="text-[14.5px] leading-relaxed">
                  {ancestor.hidden || !ancestor.slug ? (
                    // It exists and it is in the chain; that is all a reader who
                    // cannot open it is told.
                    <span className="text-ink-soft italic">{ancestor.title}</span>
                  ) : (
                    <>
                      <Link href={`/s/${ancestor.slug}`} className="text-pencil hover:underline">
                        {ancestor.title}
                      </Link>
                      <span className="text-ink-soft"> by {nameOf(ancestor.owner)}</span>
                    </>
                  )}
                  {ancestor.forkedAt ? (
                    <span className="text-ink-faint">
                      {' · '}
                      {ancestor.forkedAt.toLocaleDateString('en-GB', DATE)}
                    </span>
                  ) : null}
                  {ancestor.continuedSince ? (
                    <p className="mt-0.5 text-[12.5px] text-ink-faint">
                      That story has continued since. Nothing written there after this date appears
                      here.
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {lineage.truncated ? (
              <p className="mt-3 text-[12.5px] text-ink-faint">
                {lineage.total - lineage.ancestors.length} older{' '}
                {lineage.total - lineage.ancestors.length === 1 ? 'storyboard' : 'storyboards'} in
                the chain are not shown. Open the one above to keep walking back.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* ── Descendants (FR-10.6) */}
      <section className="mt-10 border-t border-rule pt-8">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Taken somewhere else
        </h2>

        {spinOffs.total === 0 ? (
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            Nobody has spun this story off yet.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {spinOffs.spinOffs.map((spinOff) => (
                <li key={spinOff.id} className="flex items-baseline justify-between gap-4 py-3.5">
                  <p className="min-w-0 text-[14.5px]">
                    <Link href={`/s/${spinOff.slug}`} className="text-pencil hover:underline">
                      {spinOff.title}
                    </Link>
                    <span className="text-ink-soft"> by {nameOf(spinOff.owner)}</span>
                  </p>
                  {spinOff.forkedAt ? (
                    <time
                      dateTime={spinOff.forkedAt.toISOString()}
                      className="shrink-0 text-[12.5px] text-ink-faint tabular-nums"
                    >
                      {spinOff.forkedAt.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  ) : null}
                </li>
              ))}
            </ul>
            {spinOffs.privateCount > 0 ? (
              <p className="mt-3 text-[12.5px] text-ink-faint">
                {spinOffs.privateCount === 1
                  ? 'One more is a private draft and is not listed.'
                  : `${spinOffs.privateCount} more are private drafts and are not listed.`}
              </p>
            ) : null}
          </>
        )}

        {/* FR-10.7 — the offer exists only where the act does. */}
        {storyboard.visibility === 'PUBLIC' && session?.user ? (
          <div className="mt-8 border-t border-rule pt-6">
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              You can start your own version of {storyboard.title}. It becomes a private storyboard
              of yours, credited to everyone who has written in this one, and it will not follow
              what happens here afterwards.
            </p>
            <div className="mt-4">
              <SpinOffButton storyboardId={storyboard.id} title={storyboard.title} />
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}
