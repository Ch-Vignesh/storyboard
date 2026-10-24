'use client'

import { Select } from '@storyboard/ui/components/select'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

type Version = { id: string; name: string; isMain: boolean }
type Chapter = { number: number; title: string }
type Format = { format: string; label: string }

/**
 * FR-14.2 (phase 14, item 8.8) — what to take out, then the format.
 *
 * A version (the main draft, or an alternate), and the whole story or one
 * chapter of it. Choosing a version loads that version's chapters from the
 * server; the rest is in the download links, which say it all in named query
 * parameters (`format`, `version`, `chapter`), so a link copied from here is
 * the same file tomorrow. The contributors page and the source line travel in
 * every one of them (FR-14.3).
 */
export function ExportChoices({
  slug,
  versions,
  versionId,
  chapters,
  formats,
}: {
  slug: string
  versions: Version[]
  /** The version these chapters are of. */
  versionId: string
  chapters: Chapter[]
  formats: Format[]
}) {
  const router = useRouter()
  const ids = useId()
  const [scope, setScope] = useState<'story' | 'chapter'>('story')
  const [chapter, setChapter] = useState(chapters[0]?.number ?? 1)
  const current = versions.find((version) => version.id === versionId)

  const href = (format: string) => {
    const query = new URLSearchParams({ format })
    if (current && !current.isMain) query.set('version', current.id)
    if (scope === 'chapter') query.set('chapter', String(chapter))
    return `/api/export/${encodeURIComponent(slug)}?${query.toString()}`
  }

  return (
    <div className="mt-3 space-y-6">
      {versions.length > 1 ? (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-version`} className="text-[13.5px] font-medium text-ink">
            Which version
          </label>
          <Select
            id={`${ids}-version`}
            value={versionId}
            onChange={(event) => {
              const next = versions.find((version) => version.id === event.target.value)
              // Every choice names its version in the address, the main
              // draft too: with a published edition, a bare address opens on
              // the edition (item 7b.3), and choosing the main draft went
              // straight back to it.
              router.replace(
                next
                  ? `/s/${slug}/export?version=${encodeURIComponent(next.id)}`
                  : `/s/${slug}/export`,
              )
            }}
            className="block max-w-sm"
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.isMain ? 'The main draft' : version.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {chapters.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-[13.5px] font-medium text-ink">How much</legend>
          <label className="flex items-center gap-2.5 text-[14px] text-ink">
            <input
              type="radio"
              name={`${ids}-scope`}
              checked={scope === 'story'}
              onChange={() => setScope('story')}
            />
            The whole story
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2.5 text-[14px] text-ink">
              <input
                type="radio"
                name={`${ids}-scope`}
                checked={scope === 'chapter'}
                onChange={() => setScope('chapter')}
              />
              One chapter
            </label>
            <Select
              aria-label="Which chapter"
              value={chapter}
              onChange={(event) => {
                setChapter(Number(event.target.value))
                setScope('chapter')
              }}
              className="w-auto max-w-full"
            >
              {chapters.map((entry) => (
                <option key={entry.number} value={entry.number}>
                  {entry.number}. {entry.title}
                </option>
              ))}
            </Select>
          </div>
        </fieldset>
      ) : null}

      <ul className="divide-y divide-rule border-y border-rule">
        {formats.map(({ format, label }) => (
          <li key={format} className="flex items-center justify-between gap-4 py-3">
            <span className="text-[14.5px] text-ink">{label}</span>
            <a
              href={href(format)}
              aria-label={`Download ${label}`}
              className="shrink-0 text-[13.5px] text-pencil hover:underline"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
