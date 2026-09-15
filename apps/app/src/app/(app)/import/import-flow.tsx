'use client'

import { IMPORT_LIMITS, STRATEGY_COPY, type Proposal, type Strategy } from '@storyboard/import'
import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Select } from '@storyboard/ui/components/select'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { STORYBOARD_GENRES } from '@/lib/schemas/constants'
import { STORY_TYPES, VISIBILITY_COPY, type StoryTypeValue } from '@/lib/schemas/storyboard'
import { useTRPC } from '@/trpc/client'

import { BoundaryReview, type Outline } from './boundary-review'

type Genre = { id: string; slug: string; name: string }

const ACCEPT = '.docx,.md,.txt,.rtf,.fountain,.fdx'

/**
 * Import, stage by stage (FR-3.2).
 *
 * Choose → upload → proposal → review → confirm. The stages are one component
 * because they are one task: a writer who has just uploaded 80,000 words should
 * not be navigated anywhere, and losing the proposal to a route change would
 * mean uploading again.
 */
export function ImportFlow({ genres }: { genres: Genre[] }) {
  const trpc = useTRPC()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [outline, setOutline] = useState<Outline>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<StoryTypeValue>('NOVEL')
  const [genreIds, setGenreIds] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE')

  const createUpload = useMutation(trpc.import.createUpload.mutationOptions())
  const analyse = useMutation(trpc.import.analyse.mutationOptions())
  const commit = useMutation(
    trpc.import.commit.mutationOptions({
      onSuccess: (storyboard) => router.push(`/s/${storyboard.slug}`),
    }),
  )

  async function upload(chosen: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const { jobId: id, upload: target } = await createUpload.mutateAsync({
        fileName: chosen.name,
        byteSize: chosen.size,
      })

      const response = await fetch(target.url, {
        method: 'PUT',
        headers: target.headers,
        body: chosen,
        // The local endpoint needs the session cookie; a presigned URL must not
        // be sent one, and would reject the request if it were.
        credentials: target.direct ? 'omit' : 'same-origin',
      })
      if (!response.ok) throw new Error('The upload did not finish.')

      setJobId(id)
      const result = await analyse.mutateAsync({ jobId: id })
      setProposal(result)
      setOutline(
        result.chapters.map((chapter) => ({
          title: chapter.title,
          sections: chapter.sections.map((section) => ({ from: section.from, to: section.to })),
        })),
      )
      // A sensible first guess at the title: the file's name without its suffix.
      setTitle(
        (current) => current || chosen.name.replace(/\.[^.]+$/u, '').replaceAll(/[_-]+/gu, ' '),
      )
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'That did not work.')
    } finally {
      setUploading(false)
    }
  }

  const toggleGenre = (id: string) =>
    setGenreIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= STORYBOARD_GENRES.max) return current
      return [...current, id]
    })

  const error = uploadError ?? createUpload.error?.message ?? analyse.error?.message ?? null
  const busy = uploading || analyse.isPending

  // ── Stage one: choose a file.
  if (!proposal || !jobId) {
    return (
      <section className="mt-10 border-t border-rule pt-8">
        <Label htmlFor="manuscript">Your manuscript</Label>
        <input
          id="manuscript"
          type="file"
          accept={ACCEPT}
          disabled={busy}
          className="mt-2 block w-full text-[16px] text-ink-soft file:mr-4 file:border file:border-rule file:bg-paper file:px-3 file:py-1.5 file:text-[13px] file:text-ink hover:file:border-ink-faint sm:text-[14px]"
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null
            setFile(chosen)
            if (chosen) void upload(chosen)
          }}
        />
        <p className="mt-2 text-[12.5px] text-ink-faint">
          .docx, .md, .txt, .rtf, .fountain or .fdx. Up to 5 MB and{' '}
          {IMPORT_LIMITS.words.toLocaleString('en-GB')} words.
        </p>

        {busy ? (
          <p className="mt-4 text-[13.5px] text-ink-soft">Reading {file?.name ?? 'the file'}…</p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-[13.5px] text-crimson">
            {error}
          </p>
        ) : null}
      </section>
    )
  }

  // ── Stage two: the review screen (FR-3.2, FR-3.5).
  const totalSections = outline.reduce((total, chapter) => total + chapter.sections.length, 0)

  return (
    <section className="mt-10 border-t border-rule pt-8">
      <h2 className="font-manuscript text-[21px] leading-snug font-medium text-ink">
        Is this where the chapters are?
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        {proposal.wordCount.toLocaleString('en-GB')} words, read as {outline.length}{' '}
        {outline.length === 1 ? 'chapter' : 'chapters'} and {totalSections}{' '}
        {totalSections === 1 ? 'section' : 'sections'}. Every boundary below was{' '}
        {strategyPhrase(proposal.strategy)} — move, add or remove any of them. Nothing is saved
        until you confirm.
      </p>

      {proposal.dropped.length > 0 ? (
        <p className="mt-3 max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
          Not carried across from this file: {proposal.dropped.join(', ')}.
        </p>
      ) : null}

      <BoundaryReview proposal={proposal} outline={outline} onChange={setOutline} />

      {/* Everything a storyboard needs that a file cannot tell us. */}
      <div className="mt-10 space-y-7 border-t border-rule pt-8">
        <div className="space-y-1.5">
          <Label htmlFor="import-title">Title</Label>
          <Input
            id="import-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="import-type">What is it?</Label>
          <Select
            id="import-type"
            value={type}
            onChange={(event) => setType(event.target.value as StoryTypeValue)}
          >
            {STORY_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-ink">
            Genres ({STORYBOARD_GENRES.min} to {STORYBOARD_GENRES.max})
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <button
                key={genre.id}
                type="button"
                onClick={() => toggleGenre(genre.id)}
                aria-pressed={genreIds.includes(genre.id)}
                className={
                  genreIds.includes(genre.id)
                    ? 'border border-pencil bg-pencil-wash px-2.5 py-1 text-[13px] text-pencil'
                    : 'border border-rule bg-paper px-2.5 py-1 text-[13px] text-ink-soft hover:border-ink-faint'
                }
              >
                {genre.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-ink">Who can read it</legend>
          {(['PRIVATE', 'PUBLIC'] as const).map((value) => {
            const copy = value === 'PUBLIC' ? VISIBILITY_COPY.public : VISIBILITY_COPY.private
            return (
              <label key={value} className="flex items-start gap-2.5 text-[13.5px] text-ink-soft">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-1"
                />
                <span>
                  <span className="text-ink">{copy.label}</span>
                  <span className="block text-[12.5px] text-ink-faint">{copy.summary}</span>
                </span>
              </label>
            )
          })}
          {/* FR-13.6 — the honest warning, wherever public is on offer. */}
          {visibility === 'PUBLIC' ? (
            <p className="max-w-measure border-l-2 border-ochre/50 py-1 pl-3 text-[12.5px] leading-relaxed text-ink-faint">
              {VISIBILITY_COPY.copyingRisk}
            </p>
          ) : null}
        </fieldset>

        {commit.error ? (
          <p role="alert" className="text-[13.5px] text-crimson">
            {commit.error.message}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={
              commit.isPending ||
              title.trim().length === 0 ||
              genreIds.length < STORYBOARD_GENRES.min
            }
            onClick={() => {
              commit.mutate({
                jobId,
                title: title.trim(),
                type,
                genreIds,
                visibility,
                outline: outline.map((chapter) => ({
                  title: chapter.title.trim() || 'Untitled chapter',
                  sections: chapter.sections,
                })),
              })
            }}
          >
            {commit.isPending ? 'Writing it in…' : 'This is right — bring it in'}
          </Button>
          <Button
            variant="ghost"
            disabled={commit.isPending}
            onClick={() => {
              setProposal(null)
              setJobId(null)
              setFile(null)
            }}
          >
            Start again with another file
          </Button>
        </div>
      </div>
    </section>
  )
}

/** FR-3.5 — confidence as a phrase, never a number. */
function strategyPhrase(strategy: Strategy): string {
  return STRATEGY_COPY[strategy]
}
