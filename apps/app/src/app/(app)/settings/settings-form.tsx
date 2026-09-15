'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { PINNED_GENRES_MIN, READING_LINE_HEIGHT, READING_TYPE_SCALE } from '@/lib/schemas/constants'
import { NOTIFICATIONS, NOTIFICATION_TYPES } from '@/lib/schemas/notifications'
import { useTRPC } from '@/trpc/client'

import { DeleteAccount } from './delete-account'

export function SettingsForm() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const { data: settings } = useSuspenseQuery(trpc.settings.get.queryOptions())
  const { data: allGenres } = useSuspenseQuery(trpc.user.genres.queryOptions())

  const [displayName, setDisplayName] = useState(settings.user.displayName ?? '')
  const [bio, setBio] = useState(settings.user.bio ?? '')
  const [genreIds, setGenreIds] = useState<string[]>(settings.pinnedGenreIds)

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() })
  }

  const updateProfile = useMutation(
    trpc.settings.updateProfile.mutationOptions({ onSuccess: refetch }),
  )
  const updateGenres = useMutation(
    trpc.settings.updateGenres.mutationOptions({ onSuccess: refetch }),
  )
  const setEmailPreference = useMutation(
    trpc.settings.setEmailPreference.mutationOptions({ onSuccess: refetch }),
  )
  const setAllEmail = useMutation(trpc.settings.setAllEmail.mutationOptions({ onSuccess: refetch }))
  const setReading = useMutation(
    trpc.user.setReadingPreferences.mutationOptions({ onSuccess: refetch }),
  )

  const toggleGenre = (id: string) =>
    setGenreIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  const genresShort = PINNED_GENRES_MIN - genreIds.length

  return (
    <div className="mt-10 space-y-14">
      {/* ── Account ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Account</h2>

        <dl className="mt-4 space-y-1 text-[13.5px]">
          <div className="flex gap-2">
            <dt className="text-ink-faint">Email</dt>
            <dd className="text-ink">{settings.user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-faint">Username</dt>
            <dd className="text-ink">@{settings.user.username}</dd>
          </div>
        </dl>
        {/* FR-1.3 — chosen once, printed in every credit line. Saying so here
            explains the absence of a field rather than leaving a hole. */}
        <p className="mt-2 max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
          Your username cannot be changed. It appears in your credit line on every contribution you
          have made, and rewriting those would rewrite other people&rsquo;s history too.
        </p>

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            updateProfile.mutate({ displayName: displayName.trim(), bio: bio.trim() || null })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Name to show</Label>
            <Input
              id="display-name"
              required
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-describedby="display-name-hint"
            />
            <p id="display-name-hint" className="text-[12.5px] text-ink-faint">
              What people see. Changing it changes every credit line at once.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">About you</Label>
            <Textarea
              id="bio"
              rows={3}
              maxLength={280}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
            <p className="text-[12.5px] text-ink-faint">
              <span className="tabular-nums">{bio.length}</span> of 280 characters
            </p>
          </div>

          {updateProfile.isError ? (
            <p role="alert" className="text-[13px] text-crimson">
              {updateProfile.error.message}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving' : 'Save'}
            </Button>
            <span role="status" aria-live="polite" className="text-[13px] text-moss">
              {updateProfile.isSuccess ? 'Saved.' : ''}
            </span>
          </div>
        </form>
      </section>

      {/* ── Genres (FR-11.2) ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Genres</h2>
        <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
          These decide which stuck passages your dashboard shows you, and nothing else. There is no
          ranking behind them.
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {allGenres.map((genre) => {
            const rank = genreIds.indexOf(genre.id)
            const selected = rank !== -1
            return (
              <li key={genre.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleGenre(genre.id)}
                  className={
                    selected
                      ? 'flex min-h-9 items-center gap-1.5 rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13.5px] text-pencil'
                      : 'flex min-h-9 items-center rounded-control border border-rule bg-paper px-3 py-1.5 text-[13.5px] text-ink-soft hover:border-ink-faint'
                  }
                >
                  {selected ? (
                    <span
                      aria-hidden
                      className="flex size-4 items-center justify-center rounded-full bg-pencil text-[10px] font-medium text-white"
                    >
                      {rank + 1}
                    </span>
                  ) : null}
                  {genre.name}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={genresShort > 0 || updateGenres.isPending}
            onClick={() => updateGenres.mutate({ genreIds })}
          >
            {updateGenres.isPending ? 'Saving' : 'Save genres'}
          </Button>
          <span role="status" aria-live="polite" className="text-[13px] text-ink-faint">
            {genresShort > 0
              ? `Pick ${String(genresShort)} more.`
              : updateGenres.isSuccess
                ? 'Saved.'
                : `${String(genreIds.length)} pinned.`}
          </span>
        </div>
      </section>

      {/* ── Reading (NFR-5) ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Reading</h2>
        <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
          How manuscripts are set for you. Saved to your account, so it follows you to any device.
        </p>

        <div className="mt-4 max-w-sm space-y-5">
          <div>
            <label
              htmlFor="type-scale"
              className="flex items-baseline justify-between text-[13.5px] text-ink"
            >
              Type size
              <span className="text-[12px] text-ink-faint tabular-nums">
                {settings.user.readingTypeScale}%
              </span>
            </label>
            <input
              id="type-scale"
              type="range"
              className="mt-2 w-full accent-pencil"
              min={READING_TYPE_SCALE.min}
              max={READING_TYPE_SCALE.max}
              step={READING_TYPE_SCALE.step}
              defaultValue={settings.user.readingTypeScale}
              onChange={(event) => setReading.mutate({ typeScale: Number(event.target.value) })}
            />
          </div>

          <div>
            <label
              htmlFor="line-height"
              className="flex items-baseline justify-between text-[13.5px] text-ink"
            >
              Line spacing
              <span className="text-[12px] text-ink-faint tabular-nums">
                {(settings.user.readingLineHeight / 100).toFixed(2)}
              </span>
            </label>
            <input
              id="line-height"
              type="range"
              className="mt-2 w-full accent-pencil"
              min={READING_LINE_HEIGHT.min}
              max={READING_LINE_HEIGHT.max}
              step={READING_LINE_HEIGHT.step}
              defaultValue={settings.user.readingLineHeight}
              onChange={(event) => setReading.mutate({ lineHeight: Number(event.target.value) })}
            />
          </div>
        </div>
      </section>

      {/* ── Email (FR-12.1) ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Email</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-[12.5px] text-pencil hover:underline"
              onClick={() => setAllEmail.mutate({ email: true })}
            >
              All on
            </button>
            <button
              type="button"
              className="text-[12.5px] text-pencil hover:underline"
              onClick={() => setAllEmail.mutate({ email: false })}
            >
              All off
            </button>
          </div>
        </div>
        <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
          Notifications always appear in the application. These switches control which ones also
          reach your inbox.
        </p>

        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {NOTIFICATION_TYPES.map((type) => {
            const definition = NOTIFICATIONS[type]
            const checked = settings.emailByType[type]
            return (
              <li key={type} className="py-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-pencil"
                    checked={checked}
                    onChange={(event) =>
                      setEmailPreference.mutate({ type, email: event.target.checked })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] text-ink">{definition.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">
                      {definition.sentence}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                      {definition.delivery === 'immediate'
                        ? 'Sent straight away'
                        : definition.delivery === 'hourly'
                          ? 'Batched, at most once an hour'
                          : 'Sunday only'}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      {/* OD-3's second half, decision 0024. Last on the page, because it is the
          one thing here that cannot be undone after a week. */}
      <DeleteAccount
        username={settings.user.username}
        deletionRequestedAt={settings.user.deletionRequestedAt}
      />
    </div>
  )
}
