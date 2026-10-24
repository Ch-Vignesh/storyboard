'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Select } from '@storyboard/ui/components/select'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { STORYBOARD_GENRES, TITLE_MAX_CHARS } from '@/lib/schemas/constants'
import {
  GENRE_COPY,
  STORY_TYPES,
  VISIBILITY_COPY,
  type StoryTypeValue,
} from '@/lib/schemas/storyboard'
import { useTRPC } from '@/trpc/client'

export function CreateStoryboardForm() {
  const trpc = useTRPC()
  const router = useRouter()
  const { data: genres } = useSuspenseQuery(trpc.user.genres.queryOptions())
  const { data: me } = useSuspenseQuery(trpc.user.me.queryOptions())

  const [title, setTitle] = useState('')
  const [type, setType] = useState<StoryTypeValue>('NOVEL')
  const [genreIds, setGenreIds] = useState<string[]>([])
  // Item 3.15 — starts where settings say; FR-13.6's words still sit beside it.
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(me.defaultVisibility)

  const create = useMutation(
    trpc.storyboard.create.mutationOptions({
      // Phase 14, item 8.2 (FR-2.2) — straight to the first word: the editor,
      // open on the section every new story starts with.
      onSuccess: (storyboard) => router.push(`/s/${storyboard.slug}/c/1/1/edit`),
    }),
  )

  const toggleGenre = (id: string) =>
    setGenreIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= STORYBOARD_GENRES.max) return current
      return [...current, id]
    })

  // Item 8.10 — sent without a genre, the form says so rather than sitting
  // disabled with no reason given.
  const [genresMissing, setGenresMissing] = useState(false)
  const tooFewGenres = genreIds.length < STORYBOARD_GENRES.min
  const canSubmit = title.trim().length > 0 && !create.isPending

  return (
    <form
      className="mt-9 space-y-7"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        if (tooFewGenres) {
          setGenresMissing(true)
          return
        }
        create.mutate({ title: title.trim(), type, genreIds, visibility })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          maxLength={TITLE_MAX_CHARS}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="The ship never lands"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">What is it?</Label>
        <Select
          id="type"
          value={type}
          onChange={(event) => setType(event.target.value as StoryTypeValue)}
        >
          {STORY_TYPES.map((storyType) => (
            <option key={storyType.value} value={storyType.value}>
              {storyType.label}
            </option>
          ))}
        </Select>
        <p className="text-[12.5px] text-ink-faint">
          Screenplays and stage plays get script formatting; everything else gets prose.
        </p>
      </div>

      <fieldset
        className="space-y-2"
        aria-describedby={genresMissing ? 'genres-missing' : undefined}
      >
        <legend className="text-[13.5px] font-medium text-ink">
          Genres <span className="font-normal text-ink-faint">({GENRE_COPY.hint})</span>
        </legend>
        <ul className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const selected = genreIds.includes(genre.id)
            const full = !selected && genreIds.length >= STORYBOARD_GENRES.max
            return (
              <li key={genre.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={full}
                  onClick={() => toggleGenre(genre.id)}
                  className={
                    selected
                      ? 'rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13.5px] text-pencil'
                      : 'rounded-control border border-rule bg-paper px-3 py-1.5 text-[13.5px] text-ink-soft hover:border-ink-faint disabled:opacity-40 disabled:hover:border-rule'
                  }
                >
                  {genre.name}
                </button>
              </li>
            )
          })}
        </ul>
        {genresMissing && tooFewGenres ? (
          <p id="genres-missing" role="alert" className="text-[13px] text-crimson">
            {GENRE_COPY.missing}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13.5px] font-medium text-ink">Who can read it?</legend>
        <div className="space-y-2">
          {(['PUBLIC', 'PRIVATE'] as const).map((value) => {
            const copy = value === 'PUBLIC' ? VISIBILITY_COPY.public : VISIBILITY_COPY.private
            return (
              <label
                key={value}
                className={
                  visibility === value
                    ? 'flex cursor-pointer items-start gap-3 rounded-control border border-pencil bg-pencil-wash px-4 py-3'
                    : 'flex cursor-pointer items-start gap-3 rounded-control border border-rule bg-paper px-4 py-3 hover:border-ink-faint'
                }
              >
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-1 size-4 accent-pencil"
                />
                <span>
                  <span className="block text-[14px] font-medium text-ink">{copy.label}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-soft">{copy.summary}</span>
                </span>
              </label>
            )
          })}
        </div>

        {/* FR-13.6 — said plainly, at the moment the choice is made, and not
            tucked behind a link. It is the honest answer to a real risk. */}
        {visibility === 'PUBLIC' ? (
          <p className="border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            {VISIBILITY_COPY.copyingRisk}
          </p>
        ) : null}
      </fieldset>

      {create.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {create.error.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
        {create.isPending ? 'Creating' : 'Create and start writing'}
      </Button>
    </form>
  )
}
