'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Select } from '@storyboard/ui/components/select'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  REQUEST_ASK_WORDS,
  REQUEST_EXTRAS,
  REQUEST_PRE_CONTEXT_WORDS,
  REQUEST_TITLE_MAX_CHARS,
  SUGGESTION_WORDS,
} from '@/lib/schemas/constants'
import {
  PROSE_KINDS,
  REQUEST_KINDS,
  WORD_BOUNDS_SENTENCE,
  countWords,
  type RequestKind,
} from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

type SectionOption = { id: string; lineageId: string; wordCount: number; label: string }

/** Item 6.1 — the request being changed, when the form is the edit page. */
export type RequestEdit = {
  requestId: string
  kind: RequestKind
  sectionId: string
  initial: {
    title: string
    ask: string
    preContext: string
    toneNotes: string
    characterNotes: string
    constraints: string[]
    readingList: string[]
    minWords: number
    maxWords: number
  }
}

export function OpenRequestForm({
  slug,
  sections,
  initialSectionId,
  edit,
}: {
  slug: string
  sections: SectionOption[]
  initialSectionId?: string
  /** Item 6.1 — set, the form changes this request instead of opening one. */
  edit?: RequestEdit
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const [kind, setKind] = useState<RequestKind | null>(edit?.kind ?? null)
  const [sectionId, setSectionId] = useState(
    edit?.sectionId ?? initialSectionId ?? sections[0]?.id ?? '',
  )
  const [title, setTitle] = useState(edit?.initial.title ?? '')
  const [ask, setAsk] = useState(edit?.initial.ask ?? '')
  const [preContext, setPreContext] = useState(edit?.initial.preContext ?? '')
  const [toneNotes, setToneNotes] = useState(edit?.initial.toneNotes ?? '')
  const [characterNotes, setCharacterNotes] = useState(edit?.initial.characterNotes ?? '')
  const [constraints, setConstraints] = useState<string[]>(edit?.initial.constraints ?? [])
  const [constraintDraft, setConstraintDraft] = useState('')
  const [readingList, setReadingList] = useState<string[]>(edit?.initial.readingList ?? [])
  const [minWords, setMinWords] = useState<number>(
    edit?.initial.minWords ?? SUGGESTION_WORDS.defaultMin,
  )
  const [maxWords, setMaxWords] = useState<number>(
    edit?.initial.maxWords ?? SUGGESTION_WORDS.defaultMax,
  )

  const create = useMutation(
    trpc.request.create.mutationOptions({
      onSuccess: (request) => router.push(`/s/${slug}/help/${request.publicId}`),
    }),
  )
  const update = useMutation(
    trpc.request.update.mutationOptions({
      onSuccess: (request) => {
        router.push(`/s/${slug}/help/${request.publicId}`)
        router.refresh()
      },
    }),
  )
  const busy = create.isPending || update.isPending
  const failure = create.error ?? update.error

  const wantsProse = kind !== null && PROSE_KINDS.includes(kind)
  const askWords = countWords(ask)
  const preContextWords = countWords(preContext)

  const ready =
    kind !== null &&
    sectionId !== '' &&
    title.trim().length > 0 &&
    askWords >= REQUEST_ASK_WORDS.min &&
    askWords <= REQUEST_ASK_WORDS.max &&
    (!wantsProse ||
      (preContextWords >= REQUEST_PRE_CONTEXT_WORDS.min &&
        preContextWords <= REQUEST_PRE_CONTEXT_WORDS.max)) &&
    (!wantsProse || (withinBounds(minWords) && withinBounds(maxWords) && minWords <= maxWords))

  // FR-5.2 — the kind picker comes first and the form changes behind it.
  if (kind === null) {
    return (
      <div className="mt-9 space-y-3">
        {REQUEST_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className="block w-full border border-rule bg-paper px-5 py-4 text-left hover:border-pencil hover:bg-pencil-wash/40"
          >
            <span className="block font-manuscript text-[19px] text-ink">{option.label}</span>
            <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-soft">
              {option.blurb}
            </span>
            <span className="mt-2 block text-[12px] text-ink-faint">
              {option.returns === 'prose'
                ? 'People send you prose you can accept into the draft.'
                : 'People send you ideas. Nothing gets written into your draft.'}
            </span>
          </button>
        ))}
      </div>
    )
  }

  const chosen = REQUEST_KINDS.find((option) => option.value === kind)!

  return (
    <form
      className="mt-9 space-y-7"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        const fields = {
          title: title.trim(),
          ask: ask.trim(),
          preContext: wantsProse ? preContext.trim() : undefined,
          toneNotes: toneNotes.trim() || undefined,
          characterNotes: characterNotes.trim() || undefined,
          constraints: constraints.length > 0 ? constraints : undefined,
          readingList: readingList.length > 0 ? readingList : undefined,
          minWords,
          maxWords,
        }
        if (edit) update.mutate({ requestId: edit.requestId, ...fields })
        else create.mutate({ sectionId, kind, ...fields })
      }}
    >
      <div className="flex items-baseline justify-between border-b border-rule pb-3">
        <p className="font-manuscript text-[19px] text-ink">{chosen.label}</p>
        {/* Item 6.1 — the kind and the section are what a request is; a change keeps them. */}
        {edit ? null : (
          <button
            type="button"
            onClick={() => setKind(null)}
            className="text-[13px] text-pencil hover:underline"
          >
            Change
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="section">Which section?</Label>
        <Select
          id="section"
          value={sectionId}
          disabled={edit !== undefined}
          onChange={(event) => setSectionId(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label} — {section.wordCount} words
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          maxLength={REQUEST_TITLE_MAX_CHARS}
          aria-describedby="title-count"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Chapter four will not start"
        />
        <CharCounter id="title-count" count={title.length} max={REQUEST_TITLE_MAX_CHARS} />
      </div>

      {/* FR-5.3 */}
      <div className="space-y-1.5">
        <Label htmlFor="ask">What is wrong, and what do you need?</Label>
        <Textarea
          id="ask"
          rows={5}
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          placeholder="Be specific. What have you tried? What is the scene supposed to do?"
        />
        <WordCounter count={askWords} min={REQUEST_ASK_WORDS.min} max={REQUEST_ASK_WORDS.max} />
      </div>

      {/* FR-5.4 — required for the prose kinds, and the point of it is that
          nobody should have to read chapters one to three first. */}
      {wantsProse ? (
        <div className="space-y-1.5">
          <Label htmlFor="pre-context">The story so far</Label>
          <Textarea
            id="pre-context"
            rows={7}
            value={preContext}
            onChange={(event) => setPreContext(event.target.value)}
            placeholder="Enough that someone can write this passage without reading the earlier chapters."
          />
          <WordCounter
            count={preContextWords}
            min={REQUEST_PRE_CONTEXT_WORDS.min}
            max={REQUEST_PRE_CONTEXT_WORDS.max}
          />
          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            This is the answer to &ldquo;do I have to read everything first?&rdquo;. Someone should
            be able to help from this alone.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="tone">Tone notes</Label>
        <Textarea
          id="tone"
          rows={3}
          maxLength={REQUEST_EXTRAS.toneNotesMaxChars}
          aria-describedby="tone-count"
          value={toneNotes}
          onChange={(event) => setToneNotes(event.target.value)}
          placeholder="Optional. Close third person, dry, no dialogue tags beyond said."
        />
        <CharCounter
          id="tone-count"
          count={toneNotes.length}
          max={REQUEST_EXTRAS.toneNotesMaxChars}
        />
      </div>

      {/* Item 6.2 (FR-5.6) — the people, in their own box. */}
      <div className="space-y-1.5">
        <Label htmlFor="characters">Character notes</Label>
        <Textarea
          id="characters"
          rows={3}
          maxLength={REQUEST_EXTRAS.toneNotesMaxChars}
          aria-describedby="characters-count"
          value={characterNotes}
          onChange={(event) => setCharacterNotes(event.target.value)}
          placeholder="Optional. Ruth never explains herself; the harbourmaster before her cut pages out of the log."
        />
        <CharCounter
          id="characters-count"
          count={characterNotes.length}
          max={REQUEST_EXTRAS.toneNotesMaxChars}
        />
      </div>

      {/* FR-5.6 — constraints render as a checklist on the composer, so the
          helper can see them while writing. */}
      <fieldset className="space-y-2">
        <legend className="text-[13.5px] font-medium text-ink">Hard constraints</legend>
        <p className="text-[12.5px] text-ink-faint">
          Things that cannot change. &ldquo;She does not die.&rdquo; &ldquo;Stay in first
          person.&rdquo;{' '}
          <span className="tabular-nums">
            {constraints.length} of {REQUEST_EXTRAS.constraintsMax}
          </span>
          , each under {REQUEST_EXTRAS.constraintMaxChars} characters.
        </p>
        {constraints.length > 0 ? (
          <ul className="space-y-1">
            {constraints.map((constraint, index) => (
              <li key={index} className="flex items-center gap-2 text-[13.5px] text-ink">
                <span aria-hidden className="text-ink-faint">
                  ·
                </span>
                <span className="flex-1">{constraint}</span>
                <button
                  type="button"
                  className="text-[12px] text-ink-faint hover:text-crimson"
                  onClick={() => setConstraints((c) => c.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            aria-label="Add a constraint"
            value={constraintDraft}
            maxLength={REQUEST_EXTRAS.constraintMaxChars}
            onChange={(event) => setConstraintDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                const value = constraintDraft.trim()
                if (value && constraints.length < REQUEST_EXTRAS.constraintsMax) {
                  setConstraints((c) => [...c, value])
                  setConstraintDraft('')
                }
              }
            }}
            placeholder="She cannot die"
          />
          <Button
            type="button"
            disabled={
              !constraintDraft.trim() || constraints.length >= REQUEST_EXTRAS.constraintsMax
            }
            onClick={() => {
              setConstraints((c) => [...c, constraintDraft.trim()])
              setConstraintDraft('')
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      {/* FR-5.5 — suggested reading, rendered inline on the request page. */}
      <fieldset className="space-y-2">
        <legend className="text-[13.5px] font-medium text-ink">Worth reading first</legend>
        <p className="text-[12.5px] text-ink-faint">
          Optional. These appear on the request itself, in order, so nobody has to go hunting.{' '}
          <span className="tabular-nums">
            {readingList.length} of {REQUEST_EXTRAS.readingListMax}
          </span>
          {readingList.length >= REQUEST_EXTRAS.readingListMax ? ' — that is the most.' : '.'}
        </p>
        <ul className="space-y-1">
          {sections.map((section) => (
            <li key={section.lineageId}>
              <label className="flex items-center gap-2 text-[13.5px] text-ink-soft">
                <input
                  type="checkbox"
                  className="size-4 accent-pencil"
                  checked={readingList.includes(section.lineageId)}
                  disabled={
                    !readingList.includes(section.lineageId) &&
                    readingList.length >= REQUEST_EXTRAS.readingListMax
                  }
                  onChange={(event) =>
                    setReadingList((current) =>
                      event.target.checked
                        ? [...current, section.lineageId]
                        : current.filter((id) => id !== section.lineageId),
                    )
                  }
                />
                {section.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {/* FR-5.8 — only meaningful when prose is coming back. */}
      {wantsProse ? (
        <fieldset className="space-y-2">
          <legend className="text-[13.5px] font-medium text-ink">How long should it be?</legend>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="min-words">At least</Label>
              <Input
                id="min-words"
                type="number"
                className="w-28"
                min={SUGGESTION_WORDS.floor}
                max={SUGGESTION_WORDS.ceiling}
                value={minWords}
                onChange={(event) => setMinWords(Number(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-words">At most</Label>
              <Input
                id="max-words"
                type="number"
                className="w-28"
                min={SUGGESTION_WORDS.floor}
                max={SUGGESTION_WORDS.ceiling}
                value={maxWords}
                onChange={(event) => setMaxWords(Number(event.target.value))}
              />
            </div>
            <p className="pb-2 text-[12.5px] text-ink-faint">{WORD_BOUNDS_SENTENCE}</p>
          </div>
          {/* Item 6.12 — the server's words, before the server has to say them. */}
          {!withinBounds(minWords) || !withinBounds(maxWords) ? (
            <p role="status" className="text-[13px] text-crimson">
              {WORD_BOUNDS_SENTENCE}
            </p>
          ) : minWords > maxWords ? (
            <p role="status" className="text-[13px] text-crimson">
              The smallest number has to be smaller than the largest.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {failure ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {failure.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={!ready || busy}>
        {edit ? (busy ? 'Saving' : 'Save the changes') : busy ? 'Opening' : 'Open this for help'}
      </Button>
    </form>
  )
}

/** FR-5.8 — a word bound the server would take (item 6.12). */
function withinBounds(value: number): boolean {
  return (
    Number.isInteger(value) && value >= SUGGESTION_WORDS.floor && value <= SUGGESTION_WORDS.ceiling
  )
}

/** Item 6.12 — how much of a character limit is used; the field names it through `aria-describedby`. */
function CharCounter({ id, count, max }: { id: string; count: number; max: number }) {
  return (
    <p id={id} className="text-[12.5px] text-ink-faint">
      <span className="tabular-nums">{count.toLocaleString('en-GB')}</span> of{' '}
      {max.toLocaleString('en-GB')} characters
    </p>
  )
}

function WordCounter({ count, min, max }: { count: number; min: number; max: number }) {
  const short = count < min
  const long = count > max
  return (
    <p
      role="status"
      className={short || long ? 'text-[12.5px] text-ochre' : 'text-[12.5px] text-ink-faint'}
    >
      <span className="tabular-nums">{count}</span> words
      {short ? ` — ${String(min - count)} more to go` : null}
      {long ? ` — ${String(count - max)} over` : null}
      {!short && !long ? ` (${String(min)} to ${String(max)})` : null}
    </p>
  )
}
