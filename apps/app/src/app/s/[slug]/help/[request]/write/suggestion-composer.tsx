'use client'

import { Button } from '@storyboard/ui/components/button'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocFlavour } from '@/lib/doc/schema'
import { extensionsFor } from '@/lib/doc/tiptap'
import { SUGGESTION_NOTE_MAX_WORDS } from '@/lib/schemas/constants'
import { countWords } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

const AUTOSAVE_IDLE_MS = 3_000

/**
 * The suggestion composer (screen 9, FR-6.1 and FR-6.2).
 *
 * The constraints stay pinned beside the prose while it is written, which is
 * the whole reason FR-5.6 asks for them as a checklist rather than a paragraph
 * of notes — a constraint you have scrolled past is a constraint you will break.
 */
export function SuggestionComposer({
  suggestionId,
  flavour,
  initialContent,
  constraints,
  toneNotes,
  minWords,
  maxWords,
  requestTitle,
  backHref,
}: {
  suggestionId: string
  flavour: DocFlavour
  initialContent: unknown
  constraints: string[]
  toneNotes: string | null
  minWords: number
  maxWords: number
  requestTitle: string
  backHref: string
}) {
  const trpc = useTRPC()
  const [words, setWords] = useState(0)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const saving = useRef(false)

  const saveDraft = useMutation(trpc.suggestion.saveDraft.mutationOptions())
  const submit = useMutation(trpc.suggestion.submit.mutationOptions())

  const editor = useEditor({
    extensions: extensionsFor(flavour, 'Write the passage.'),
    content: initialContent ?? undefined,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Your suggestion', role: 'textbox' } },
    onCreate: ({ editor: instance }) => {
      // The pre-filled text already has a word count; showing 0 until the first
      // keystroke would be wrong.
      setWords(countWords(instance.getText()))
    },
    onUpdate: ({ editor: instance }) => {
      dirty.current = true
      setWords(countWords(instance.getText()))
    },
  })

  const persist = useCallback(async () => {
    if (!editor || !dirty.current || saving.current) return
    saving.current = true
    setSaved('saving')
    try {
      await saveDraft.mutateAsync({ suggestionId, contentJson: editor.getJSON() })
      dirty.current = false
      setSaved('saved')
      setError(null)
    } catch (caught) {
      setSaved('error')
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      saving.current = false
    }
  }, [editor, saveDraft, suggestionId])

  useEffect(() => {
    if (!editor) return
    const onUpdate = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void persist(), AUTOSAVE_IDLE_MS)
    }
    const onBlur = () => void persist()
    editor.on('update', onUpdate)
    editor.on('blur', onBlur)
    return () => {
      editor.off('update', onUpdate)
      editor.off('blur', onBlur)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [editor, persist])

  const noteWords = countWords(note)
  const inBounds = words >= minWords && words <= maxWords
  const canSend = inBounds && noteWords <= SUGGESTION_NOTE_MAX_WORDS && !submit.isPending && !sent

  async function send() {
    await persist()
    try {
      await submit.mutateAsync({ suggestionId, note: note.trim() || undefined })
      setSent(true)
      window.location.href = backHref
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send.')
    }
  }

  if (!editor) return <p className="text-[13.5px] text-ink-faint">Loading the editor…</p>

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_17rem]">
      <div>
        <h1 className="font-manuscript text-[24px] leading-tight font-medium text-ink">
          {requestTitle}
        </h1>

        <div className="mt-2 flex items-center gap-3 text-[12.5px]">
          <span
            className={inBounds ? 'text-ink-faint' : 'text-ochre'}
            role="status"
            aria-live="polite"
          >
            <span className="tabular-nums">{words}</span> of {minWords}–{maxWords} words
          </span>
          <span className="text-ink-faint">
            {saved === 'saving' ? 'Saving' : saved === 'saved' ? 'Draft saved' : ''}
          </span>
        </div>

        {/* FR-6.1 — nothing here is visible to anyone until it is sent. */}
        <p className="mt-4 border-l-2 border-pencil bg-pencil-wash px-4 py-2.5 text-[13px] text-ink">
          This is a private draft. Nobody can see it until you send it.
        </p>

        <div className="manuscript mt-6 max-w-measure">
          <EditorContent editor={editor} />
        </div>

        <div className="mt-8 space-y-2 border-t border-rule pt-6">
          <label htmlFor="note" className="text-[13.5px] font-medium text-ink">
            A note to the author
          </label>
          <p className="text-[12.5px] text-ink-faint">
            Optional. What you were going for. Shown above your prose when they read it.
          </p>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <p
            className={
              noteWords > SUGGESTION_NOTE_MAX_WORDS
                ? 'text-[12.5px] text-ochre'
                : 'text-[12.5px] text-ink-faint'
            }
          >
            <span className="tabular-nums">{noteWords}</span> of {SUGGESTION_NOTE_MAX_WORDS} words
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-crimson">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" size="lg" disabled={!canSend} onClick={() => void send()}>
            {submit.isPending ? 'Sending' : 'Send this to the author'}
          </Button>
          <a href={backHref} className="text-[13.5px] text-pencil hover:underline">
            Leave it as a draft
          </a>
        </div>
        {!inBounds ? (
          <p className="mt-2 text-[12.5px] text-ochre">
            {words < minWords
              ? `${String(minWords - words)} more words before you can send it.`
              : `${String(words - maxWords)} words over the limit.`}
          </p>
        ) : null}
      </div>

      {/* FR-5.6 — pinned, so they stay visible while the prose is written. */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        {constraints.length > 0 ? (
          <div className="border border-ochre/35 bg-ochre-wash px-4 py-3.5">
            <h2 className="text-[12px] font-medium tracking-wide text-ochre uppercase">
              Must hold
            </h2>
            <ul className="mt-2.5 space-y-2">
              {constraints.map((constraint, index) => (
                <li key={index}>
                  <label className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-ochre"
                      checked={checked.has(index)}
                      onChange={(event) =>
                        setChecked((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(index)
                          else next.delete(index)
                          return next
                        })
                      }
                    />
                    <span>{constraint}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ochre/80">
              Ticking these is for you. Nobody else sees it.
            </p>
          </div>
        ) : null}

        {toneNotes ? (
          <div className="mt-4 border border-rule bg-paper-sunk px-4 py-3.5">
            <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Tone</h2>
            <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
              {toneNotes}
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
