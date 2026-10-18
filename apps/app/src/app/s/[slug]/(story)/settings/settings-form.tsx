'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { SOFT_DELETE_GRACE_DAYS, STORYBOARD_GENRES } from '@/lib/schemas/constants'
import { VISIBILITY_COPY } from '@/lib/schemas/storyboard'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { requestsSentence } from '@/lib/impact-words'
import { useTRPC } from '@/trpc/client'

type Contributor = { id: string; username: string | null; displayName: string | null }
type Genre = { id: string; name: string }

export function SettingsForm({
  storyboardId,
  title: initialTitle,
  logline: initialLogline,
  rightsNote: initialRights,
  visibility: initialVisibility,
  publicFrom,
  contributors,
  genres,
  genreIds: initialGenreIds,
}: {
  storyboardId: string
  title: string
  logline: string | null
  rightsNote: string | null
  visibility: 'PUBLIC' | 'PRIVATE'
  publicFrom: Date | null
  contributors: Contributor[]
  /** Every genre, and this story's (FR-2.1). */
  genres: Genre[]
  genreIds: string[]
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const [title, setTitle] = useState(initialTitle)
  const [logline, setLogline] = useState(initialLogline ?? '')
  const [rightsNote, setRightsNote] = useState(initialRights ?? '')
  const [genreIds, setGenreIds] = useState(initialGenreIds)
  const toggleGenre = (id: string) =>
    setGenreIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= STORYBOARD_GENRES.max) return current
      return [...current, id]
    })
  const [visibility, setVisibility] = useState(initialVisibility)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Item 5.4 (FR-2.7) — going private asks first, with what it closes.
  const [confirmPrivate, setConfirmPrivate] = useState(false)
  const privacyImpact = useQuery({
    ...trpc.storyboard.privacyImpact.queryOptions({ storyboardId }),
    enabled: confirmPrivate,
  })

  const update = useMutation(
    trpc.storyboard.update.mutationOptions({ onSuccess: () => router.refresh() }),
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
            update.mutate({
              storyboardId,
              title: title.trim(),
              logline: logline.trim() || null,
              rightsNote: rightsNote.trim() || null,
              genreIds,
            })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              maxLength={200}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logline">Logline</Label>
            <Textarea
              id="logline"
              rows={2}
              maxLength={300}
              value={logline}
              onChange={(event) => setLogline(event.target.value)}
              placeholder="One sentence about the story."
            />
          </div>

          {/* FR-2.1 — genres change as a story does. The server took them
              and this form never sent them, until the 2026-10-16 review. */}
          <fieldset className="space-y-2">
            <legend className="text-[13.5px] font-medium text-ink">
              Genres{' '}
              <span className="font-normal text-ink-faint">
                ({STORYBOARD_GENRES.min} to {STORYBOARD_GENRES.max})
              </span>
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
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="rights">Rights note</Label>
            <Textarea
              id="rights"
              rows={3}
              maxLength={500}
              value={rightsNote}
              onChange={(event) => setRightsNote(event.target.value)}
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

          <Button
            type="submit"
            variant="primary"
            disabled={update.isPending || genreIds.length < STORYBOARD_GENRES.min}
          >
            {update.isPending ? 'Saving' : 'Save details'}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Who can read it
        </h2>
        <p className="mt-3 text-[14px] text-ink">
          This story is <strong className="font-medium">{visibility.toLowerCase()}</strong>.
        </p>

        {visibility === 'PUBLIC' ? (
          <p className="mt-3 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            {VISIBILITY_COPY.copyingRisk}
          </p>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
            {VISIBILITY_COPY.private.summary} Making it public opens it to readers and to help from
            other writers.
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
            Only you and the people you invite will be able to read it. Anything written while it is
            private stays private if you open it again.
          </p>
          <p>{requestsSentence(privacyImpact.data)}</p>
        </ConfirmDialog>
      </section>

      <section>
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Delete this story
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
          It disappears from everywhere immediately, and anyone answering one of its requests is
          told. For {SOFT_DELETE_GRACE_DAYS} days you can bring it back from your dashboard; after
          that it is gone for good.
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
              . Their contributions stay on their profiles, but their writing goes with this story.
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
      </section>
    </div>
  )
}
