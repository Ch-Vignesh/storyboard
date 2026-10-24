'use client'

import {
  IMPORT_LIMITS,
  STRATEGY_COPY,
  type Format,
  type Proposal,
  type Strategy,
} from '@storyboard/import/types'
import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Select } from '@storyboard/ui/components/select'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { flavourForStoryType } from '@/lib/doc/schema'
import { STORYBOARD_GENRES, TITLE_MAX_CHARS } from '@/lib/schemas/constants'
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
export function ImportFlow({
  genres,
  resume,
  defaultVisibility,
}: {
  genres: Genre[]
  /** A file read before a reload, picked up at its review (FR-3.2). */
  resume?: { jobId: string; fileName: string; proposal: Proposal }
  /** Item 3.15 — what settings say a new story starts as. */
  defaultVisibility: 'PUBLIC' | 'PRIVATE'
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(resume?.jobId ?? null)
  const [proposal, setProposal] = useState<Proposal | null>(resume?.proposal ?? null)
  const [outline, setOutline] = useState<Outline>(() => (resume ? outlineOf(resume.proposal) : []))
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [title, setTitle] = useState(resume ? titleFrom(resume.fileName) : '')
  const [type, setType] = useState<StoryTypeValue>(
    resume ? typeFor(resume.proposal.format) : 'NOVEL',
  )
  const [genreIds, setGenreIds] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(defaultVisibility)

  const createUpload = useMutation(trpc.import.createUpload.mutationOptions())
  const analyse = useMutation(trpc.import.analyse.mutationOptions())
  const commit = useMutation(
    trpc.import.commit.mutationOptions({
      onSuccess: (storyboard) => router.push(`/s/${storyboard.slug}`),
    }),
  )

  // Item 8.9 — the upload in flight, so Cancel can stop it; and a key for the
  // file input, so the same file can be chosen again after a cancel.
  const inFlight = useRef<AbortController | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [stopped, setStopped] = useState(false)
  // Leaving the page stops an upload too.
  useEffect(() => () => inFlight.current?.abort(), [])

  async function upload(chosen: File) {
    const controller = new AbortController()
    inFlight.current = controller
    const { signal } = controller
    setUploadError(null)
    setStopped(false)
    setUploading(true)
    try {
      const { jobId: id, upload: target } = await createUpload.mutateAsync({
        fileName: chosen.name,
        byteSize: chosen.size,
      })
      if (signal.aborted) return

      let response: Response
      try {
        response = await fetch(target.url, {
          method: 'PUT',
          headers: target.headers,
          body: chosen,
          // The local endpoint needs the session cookie; a presigned URL must not
          // be sent one, and would reject the request if it were.
          credentials: target.direct ? 'omit' : 'same-origin',
          signal,
        })
      } catch {
        if (signal.aborted) return
        // The browser could not send it at all: offline, or refused by a
        // policy. Its own words for that are "Failed to fetch", which is what
        // the first import on production showed (2026-10-15).
        throw new Error('Your file could not be sent. Check your connection and try again.')
      }
      if (!response.ok) throw new Error('The upload did not finish.')

      // Reading it is the server's; a cancel from here on stops the waiting,
      // and what it read is never shown. The job is cleared away with the
      // other abandoned ones (`purgeAbandonedImports`).
      const result = await analyse.mutateAsync({ jobId: id })
      if (signal.aborted) return
      setJobId(id)
      setProposal(result)
      setOutline(outlineOf(result))
      setTitle((current) => current || titleFrom(chosen.name))
      setType(typeFor(result.format))
      // So a reload comes back to this review rather than to an empty form.
      router.replace(`/import?job=${encodeURIComponent(id)}`, { scroll: false })
    } catch (error) {
      if (signal.aborted) return
      setUploadError(error instanceof Error ? error.message : 'That did not work.')
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null
        setUploading(false)
      }
    }
  }

  /** Item 8.9 — stops the upload in progress and leaves nothing on screen of it. */
  function cancelUpload() {
    inFlight.current?.abort()
    inFlight.current = null
    createUpload.reset()
    analyse.reset()
    setUploading(false)
    setUploadError(null)
    setFile(null)
    setInputKey((key) => key + 1)
    setStopped(true)
  }

  /**
   * Item 8.9 — back to choosing a file, cleanly: the review, what was typed
   * for it, and the job in the address all go. The `?job=` stayed until item
   * 8.9, so a reload brought the old file's review straight back.
   */
  function startAgain() {
    setProposal(null)
    setJobId(null)
    setFile(null)
    setOutline([])
    setTitle('')
    setType('NOVEL')
    setGenreIds([])
    setVisibility(defaultVisibility)
    setUploadError(null)
    setStopped(false)
    createUpload.reset()
    analyse.reset()
    commit.reset()
    setInputKey((key) => key + 1)
    router.replace('/import', { scroll: false })
  }

  const toggleGenre = (id: string) =>
    setGenreIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= STORYBOARD_GENRES.max) return current
      return [...current, id]
    })

  const error = uploadError ?? createUpload.error?.message ?? analyse.error?.message ?? null
  const busy = uploading

  // ── Stage one: choose a file.
  if (!proposal || !jobId) {
    return (
      <section className="mt-10 border-t border-rule pt-8">
        <Label htmlFor="manuscript">Your manuscript</Label>
        <input
          key={inputKey}
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
          .docx, .md, .txt, .rtf, .fountain or .fdx. Up to{' '}
          {String(IMPORT_LIMITS.bytes / (1024 * 1024))} MB and{' '}
          {IMPORT_LIMITS.words.toLocaleString('en-GB')} words.
        </p>

        {busy ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-[13.5px] text-ink-soft">Reading {file?.name ?? 'the file'}…</p>
            <Button size="sm" variant="ghost" onClick={cancelUpload}>
              Cancel the upload
            </Button>
          </div>
        ) : null}

        {/* Present before it has anything to say, so a screen reader hears it. */}
        <p role="status" className="mt-4 text-[13.5px] text-ink-soft">
          {stopped ? 'Upload cancelled. Nothing was brought in.' : ''}
        </p>

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
            maxLength={TITLE_MAX_CHARS}
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
          {/* Item 8.4 — said before the choice is made, since a story's type
              cannot later cross from prose to a script or back (D-16). */}
          {isScript(proposal.format) && flavourForStoryType(type) === 'prose' ? (
            <p className="max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
              This file is a script. As prose, its scene headings, characters and dialogue become
              plain paragraphs, and the story cannot be made a script again later.
            </p>
          ) : null}
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
          <Button variant="ghost" disabled={commit.isPending} onClick={startAgain}>
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

/** The proposal as an outline the review can change. */
function outlineOf(proposal: Proposal): Outline {
  return proposal.chapters.map((chapter) => ({
    title: chapter.title,
    sections: chapter.sections.map((section) => ({ from: section.from, to: section.to })),
  }))
}

/** FR-3.3's script formats: a screenplay's scene headings and elements come with them. */
function isScript(format: Format): boolean {
  return format === 'fountain' || format === 'fdx'
}

/**
 * Item 8.4 — the type a file most likely is: a script for `.fountain` and
 * `.fdx`, which carry screenplay elements (FR-3.7), a novel otherwise. It
 * preselected Novel for every file until item 8.4, and a script brought in as
 * a novel had its elements flattened into paragraphs.
 */
function typeFor(format: Format): StoryTypeValue {
  return isScript(format) ? 'SCREENPLAY' : 'NOVEL'
}

/** A sensible first guess at the title: the file's name without its suffix. */
function titleFrom(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '').replaceAll(/[_-]+/gu, ' ')
}
