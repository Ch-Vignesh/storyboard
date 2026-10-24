'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Select } from '@storyboard/ui/components/select'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { flavourForStoryType } from '@/lib/doc/schema'
import {
  SOFT_DELETE_GRACE_DAYS,
  STORYBOARD_GENRES,
  TITLE_MAX_CHARS,
  STORY_DETAIL_CHARS,
} from '@/lib/schemas/constants'
import {
  GENRE_COPY,
  STORY_TYPES,
  TYPE_FAMILY_COPY,
  VISIBILITY_COPY,
  type StoryTypeValue,
} from '@/lib/schemas/storyboard'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { requestsSentence } from '@/lib/impact-words'
import { useTRPC } from '@/trpc/client'

import { FinishedSwitch } from './finished-switch'

type Contributor = { id: string; username: string | null; displayName: string | null }
type Genre = { id: string; name: string }

export function SettingsForm({
  storyboardId,
  slug,
  title: initialTitle,
  logline: initialLogline,
  rightsNote: initialRights,
  type: initialType,
  visibility: initialVisibility,
  publicFrom,
  finished,
  finishedAt,
  owner,
  contributors,
  genres,
  genreIds: initialGenreIds,
}: {
  storyboardId: string
  slug: string
  title: string
  logline: string | null
  rightsNote: string | null
  /** Item 8.4 — changed within its family only (D-16). */
  type: StoryTypeValue
  visibility: 'PUBLIC' | 'PRIVATE'
  publicFrom: Date | null
  /** FR-14.1 — here since item 8.10. */
  finished: boolean
  finishedAt: Date | null
  /**
   * Item 8.10 — null for the owner, who changes everything here; the owner's
   * name for a co-author, who changes the details and is told who changes
   * the rest (SRS 3.2).
   */
  owner: string | null
  contributors: Contributor[]
  /** Every genre, and this story's (FR-2.1). */
  genres: Genre[]
  genreIds: string[]
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const isOwner = owner === null

  const [title, setTitle] = useState(initialTitle)
  const [logline, setLogline] = useState(initialLogline ?? '')
  const [rightsNote, setRightsNote] = useState(initialRights ?? '')
  const [type, setType] = useState(initialType)
  const [genreIds, setGenreIds] = useState(initialGenreIds)
  // Item 8.10 — "Saved" once the server has the details, until they change
  // again; and a sentence, not a disabled button, when a genre is missing.
  //
  // A new title moves the page to its new address (item 8.7), which is a new
  // page: it arrives with `?saved=1` so it says "Saved" too, and takes the
  // flag back out of the address once it has.
  const searchParams = useSearchParams()
  const [saved, setSaved] = useState(searchParams.get('saved') === '1')
  useEffect(() => {
    if (searchParams.get('saved') === '1') {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [searchParams])
  const [genresMissing, setGenresMissing] = useState(false)
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setSaved(false)
    }
  const toggleGenre = (id: string) => {
    setSaved(false)
    setGenreIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= STORYBOARD_GENRES.max) return current
      return [...current, id]
    })
  }
  const tooFewGenres = genreIds.length < STORYBOARD_GENRES.min
  // Item 8.4 (D-16) — the types this story may become: its own family's.
  const family = flavourForStoryType(initialType)
  const types = STORY_TYPES.filter((entry) => flavourForStoryType(entry.value) === family)

  const [visibility, setVisibility] = useState(initialVisibility)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Item 5.4 (FR-2.7) — going private asks first, with what it closes.
  const [confirmPrivate, setConfirmPrivate] = useState(false)
  const privacyImpact = useQuery({
    ...trpc.storyboard.privacyImpact.queryOptions({ storyboardId }),
    enabled: confirmPrivate,
  })

  const update = useMutation(
    trpc.storyboard.update.mutationOptions({
      // Item 8.10 — "Saved" says so; item 8.7 — a new title moves the
      // address, so follow it rather than wait for the old one to redirect.
      onSuccess: (saved) => {
        setSaved(true)
        const here = window.location.pathname.split('/')[2]
        if (here && saved.slug !== here)
          router.replace(`${window.location.pathname.replace(here, saved.slug)}?saved=1`)
        else router.refresh()
      },
    }),
  )
  const setVisibilityMutation = useMutation(
    trpc.storyboard.setVisibility.mutationOptions({
      onSuccess: (result) => {
        setVisibility(result.visibility)
        router.refresh()
      },
    }),
  )
  const remove = useMutation(
    trpc.storyboard.delete.mutationOptions({ onSuccess: () => router.push('/') }),
  )

  return (
    <div className="mt-9 space-y-12">
      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">Details</h2>
        <form
          className="mt-4 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (tooFewGenres) {
              setGenresMissing(true)
              return
            }
            update.mutate({
              storyboardId,
              title: title.trim(),
              logline: logline.trim() || null,
              rightsNote: rightsNote.trim() || null,
              genreIds,
              ...(type === initialType ? {} : { type }),
            })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              maxLength={TITLE_MAX_CHARS}
              required
              onChange={(event) => edited(setTitle)(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logline">Logline</Label>
            <Textarea
              id="logline"
              rows={2}
              maxLength={STORY_DETAIL_CHARS.logline}
              value={logline}
              onChange={(event) => edited(setLogline)(event.target.value)}
              placeholder="One sentence about the story."
            />
          </div>

          {/* Item 8.4 (FR-2.1, D-16) — the type, within its family; the
              reason the other family is not offered is said here, and the
              server refuses it all the same. */}
          <div className="space-y-1.5">
            <Label htmlFor="type">What is it?</Label>
            <Select
              id="type"
              value={type}
              aria-describedby="type-family"
              onChange={(event) => edited(setType)(event.target.value as StoryTypeValue)}
            >
              {types.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
            <p id="type-family" className="text-[12.5px] leading-relaxed text-ink-faint">
              {TYPE_FAMILY_COPY[family]}
            </p>
          </div>

          {/* FR-2.1 — genres change as a story does. The server took them
              and this form never sent them, until the 2026-10-16 review. */}
          <fieldset
            className="space-y-2"
            aria-describedby={genresMissing && tooFewGenres ? 'genres-missing' : undefined}
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

          <div className="space-y-1.5">
            <Label htmlFor="rights">Rights note</Label>
            <Textarea
              id="rights"
              rows={3}
              maxLength={STORY_DETAIL_CHARS.rightsNote}
              value={rightsNote}
              onChange={(event) => edited(setRightsNote)(event.target.value)}
              placeholder="For example: all rights reserved."
            />
            {/* FR-14.5 — stored as written, shown as written, verified by nobody.
                Deliberately not a licence picker, which would look authoritative. */}
            <p className="text-[12.5px] leading-relaxed text-ink-faint">
              Shown on the story exactly as you write it. Draftboard does not check it, and makes no
              claim on your work.
            </p>
          </div>

          {update.isError ? (
            <p role="alert" className="text-[13px] text-crimson">
              {update.error.message}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={update.isPending}>
              {update.isPending ? 'Saving' : 'Save details'}
            </Button>
            {/* Present before it has anything to say, so a screen reader
                hears "Saved" when it arrives. */}
            <p role="status" className="text-[13px] text-moss">
              {saved && !update.isPending ? 'Saved' : ''}
            </p>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Who can read it
        </h2>
        <p className="mt-3 text-[14px] text-ink">
          This story is <strong className="font-medium">{visibility.toLowerCase()}</strong>.
        </p>

        {isOwner ? (
          <>
            {visibility === 'PUBLIC' ? (
              <p className="mt-3 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
                {VISIBILITY_COPY.copyingRisk}
              </p>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
                {VISIBILITY_COPY.private.summary} Making it public opens it to readers and to help
                from other writers.
              </p>
            )}

            {/* FR-2.7 with OD-4 resolved (decision 0007): going public does not
                expose what was written while it was private. Say so before the
                switch, not after. */}
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
              {publicFrom
                ? `Versions written before ${publicFrom.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} stay visible to you and your co-authors only, and so does anything written while it is private: making it public again opens only what comes after.`
                : 'Everything you have written so far stays visible to you and your co-authors only. Only what you write after the switch becomes readable.'}
            </p>

            {setVisibilityMutation.isError ? (
              <p role="alert" className="mt-3 text-[13px] text-crimson">
                {setVisibilityMutation.error.message}
              </p>
            ) : null}

            <Button
              className="mt-4"
              disabled={setVisibilityMutation.isPending}
              onClick={() => {
                // Making it public closes nothing and asks nothing (decision 0007
                // keeps the private stretch private either way).
                if (visibility === 'PUBLIC') setConfirmPrivate(true)
                else setVisibilityMutation.mutate({ storyboardId, visibility: 'PUBLIC' })
              }}
            >
              {visibility === 'PUBLIC' ? 'Make it private' : 'Make it public'}
            </Button>
            <ConfirmDialog
              open={confirmPrivate}
              title="Make this story private?"
              confirmLabel="Make it private"
              busy={setVisibilityMutation.isPending || privacyImpact.isLoading}
              onCancel={() => setConfirmPrivate(false)}
              onConfirm={() =>
                setVisibilityMutation.mutate(
                  { storyboardId, visibility: 'PRIVATE' },
                  { onSuccess: () => setConfirmPrivate(false) },
                )
              }
            >
              <p>
                Only you and the people you invite will be able to read it. Anything written while
                it is private stays private if you open it again.
              </p>
              <p>{requestsSentence(privacyImpact.data)}</p>
            </ConfirmDialog>
          </>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
            Only {owner} can change who can read it.
          </p>
        )}
      </section>

      {/* FR-14.1 — finished, and what that changes. Moved here from "Take it
          out" by item 8.10. */}
      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Is it finished?
        </h2>
        {isOwner ? (
          <FinishedSwitch
            storyboardId={storyboardId}
            slug={slug}
            finished={finished}
            finishedAt={finishedAt}
          />
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
            {finished ? 'It is marked finished. ' : 'It is not marked finished. '}
            Only {owner} can mark it finished, or open it again.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Delete this story
        </h2>
        {isOwner ? (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
              It disappears from everywhere immediately, and anyone answering one of its requests is
              told. For {SOFT_DELETE_GRACE_DAYS} days you can bring it back from your dashboard;
              after that it is gone for good.
            </p>

            {/* FR-2.6 — a storyboard with credits names the people affected. A count
                is a number; a list of names is a decision. */}
            {contributors.length > 0 ? (
              <div className="mt-3 border-l-2 border-crimson bg-paper-sunk px-4 py-3">
                <p className="text-[13.5px] leading-relaxed text-ink">
                  {contributors.length === 1
                    ? 'One writer has helped with this story:'
                    : `${contributors.length} writers have helped with this story:`}{' '}
                  {contributors
                    .map((person) => person.displayName ?? person.username ?? 'a writer')
                    .join(', ')}
                  . Their contributions stay on their profiles, but their writing goes with this
                  story.
                </p>
              </div>
            ) : null}

            <label className="mt-4 flex items-start gap-2.5 text-[13.5px] text-ink">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-crimson"
                checked={confirmDelete}
                onChange={(event) => setConfirmDelete(event.target.checked)}
              />
              <span>I want to delete &ldquo;{initialTitle}&rdquo;.</span>
            </label>

            {remove.isError ? (
              <p role="alert" className="mt-3 text-[13px] text-crimson">
                {remove.error.message}
              </p>
            ) : null}

            <Button
              className="mt-4"
              variant="destructive"
              disabled={!confirmDelete || remove.isPending}
              onClick={() => remove.mutate({ storyboardId })}
            >
              {remove.isPending ? 'Deleting' : 'Delete this story'}
            </Button>
          </>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
            Only {owner} can delete this story.
          </p>
        )}
      </section>
    </div>
  )
}
