import { ExampleLabel } from '@/components/example-label'
import Link from '@/components/link'

import { STORY_TYPE_LABELS, type StoryTypeValue } from '@/lib/schemas/storyboard'
import { lastWrittenWords } from '@/lib/time-zone'

type Storyboard = {
  id: string
  slug: string
  title: string
  logline: string | null
  type: StoryTypeValue
  isSeed: boolean
  state: 'ACTIVE' | 'FINISHED' | 'DELETED'
  lastWrittenAt: Date | null
  /** Item 7b.3 — its current edition's number, if it has been published. */
  edition: number | null
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
export function StoryboardCard({
  storyboard,
  timeZone,
}: {
  storyboard: Storyboard
  timeZone: string
}) {
  return (
    <Link
      href={`/s/${storyboard.slug}`}
      className="flex h-full flex-col border border-rule bg-paper px-4 py-4 transition-colors hover:border-pencil hover:bg-pencil-wash/25"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-manuscript text-[19px] leading-snug text-ink">
          {storyboard.title}
          {storyboard.isSeed ? <ExampleLabel className="ml-2" /> : null}
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
        {/* Item 7b.3 (decision 0044) — the card is one link, to the story,
            whose page leads to the edition. */}
        {storyboard.edition !== null ? (
          <p className="mt-0.5 text-pencil">Published, edition {storyboard.edition}</p>
        ) : null}
        {/* Item 7.6 — when it was last written, and whether it is done. */}
        {storyboard.state === 'FINISHED' || storyboard.lastWrittenAt ? (
          <p className="mt-0.5 truncate">
            {storyboard.state === 'FINISHED' ? 'Finished' : null}
            {storyboard.state === 'FINISHED' && storyboard.lastWrittenAt ? ' · ' : null}
            {storyboard.lastWrittenAt ? lastWrittenWords(storyboard.lastWrittenAt, timeZone) : null}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
