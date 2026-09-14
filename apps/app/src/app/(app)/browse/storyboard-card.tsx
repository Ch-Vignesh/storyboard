import Link from 'next/link'

import { STORY_TYPE_LABELS, type StoryTypeValue } from '@/lib/schemas/storyboard'

type Storyboard = {
  id: string
  slug: string
  title: string
  logline: string | null
  type: StoryTypeValue
  isSeed: boolean
  owner: { username: string | null; displayName: string | null }
  genres: Array<{ id: string; name: string }>
  openRequests: number
  wordCount: number
}

/**
 * FR-11.4 — title, author, type, genres, word count, and a badge with the
 * number of sections open for help.
 *
 * "The badge is the primary call to action, not the title", so it is the one
 * element with a filled background and it sits where the eye lands after the
 * title rather than at the bottom of the card.
 */
export function StoryboardCard({ storyboard }: { storyboard: Storyboard }) {
  return (
    <Link
      href={`/s/${storyboard.slug}`}
      className="flex h-full flex-col border border-rule bg-paper px-4 py-4 transition-colors hover:border-pencil hover:bg-pencil-wash/25"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-manuscript text-[19px] leading-snug text-ink">
          {storyboard.title}
          {storyboard.isSeed ? (
            <span className="ml-2 border border-ochre/40 px-1 align-middle text-[10.5px] tracking-wide text-ochre uppercase">
              example
            </span>
          ) : null}
        </h3>
        {storyboard.openRequests > 0 ? (
          <span className="shrink-0 rounded-control bg-ochre px-2 py-1 text-[11.5px] font-medium text-white">
            {storyboard.openRequests} open
          </span>
        ) : null}
      </div>

      {storyboard.logline ? (
        <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-soft">
          {storyboard.logline}
        </p>
      ) : (
        <span className="flex-1" />
      )}

      <div className="mt-3 border-t border-rule/70 pt-2.5 text-[12px] text-ink-faint">
        <p className="truncate">
          {storyboard.owner.displayName ?? storyboard.owner.username} ·{' '}
          {STORY_TYPE_LABELS[storyboard.type]}
        </p>
        <p className="mt-0.5 truncate">
          {storyboard.genres.map((genre) => genre.name).join(', ')}
          {storyboard.genres.length > 0 ? ' · ' : ''}
          <span className="tabular-nums">{storyboard.wordCount.toLocaleString('en-GB')}</span> words
        </p>
      </div>
    </Link>
  )
}
