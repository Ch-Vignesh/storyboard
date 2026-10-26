'use client'

import { Button } from '@storyboard/ui/components/button'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocFlavour } from '@/lib/doc/schema'
import { ElementPicker } from '@/components/element-picker'
import { extensionsFor } from '@/lib/doc/tiptap'
import {
  DRAFT_IDLE_SECONDS,
  SUGGESTION_NOTE_MAX_CHARS,
  SUGGESTION_NOTE_MAX_WORDS,
} from '@/lib/schemas/constants'
import { countWords } from '@/lib/schemas/help'
import { allowanceLine, quotaFull, quotaFullLine, type Allowance } from '@/lib/allowance-words'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { RevisionComparison } from '@/components/revision-comparison'
import { REQUEST_ASK_PREVIEW_CHARS, SAVE_RETRY } from '@/lib/schemas/constants'
import {
  couldNotReach,
  forgetLocalCopy,
  KEPT_ON_DEVICE,
  keepLocalCopy,
  readLocalCopy,
  type LocalCopy,
} from '@/lib/unsaved'
import { useTRPC } from '@/trpc/client'

const AUTOSAVE_IDLE_MS = DRAFT_IDLE_SECONDS * 1000

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
  characterNotes,
  ask,
  allowance,
  baseRevisionId,
  headRevisionId,
  rewrite,
  change = false,
  minWords,
  maxWords,
  requestTitle,
  backHref,
  initialNote,
}: {
  suggestionId: string
  flavour: DocFlavour
  initialContent: unknown
  /** FR-6.2 — the note saved with the draft (item 1.11). */
  initialNote: string
  constraints: string[]
  toneNotes: string | null
  characterNotes: string | null
  /** Item 6.3 — the ask, in view while writing. */
  ask: string
  /** Items 6.3 and 6.4 — what may still be sent; null when it could not be read. */
  allowance: Allowance | null
  /** Item 6.6 — the text this draft was started against, and the text as it is now. */
  baseRevisionId: string | null
  headRevisionId: string | null
  /** A rewrite's words stay the writer's when the base moves; say so. */
  rewrite: boolean
  /** Item 6.7 — a sent suggestion being changed: nothing autosaves, Send saves the change. */
  change?: boolean
  minWords: number
  maxWords: number
  requestTitle: string
  backHref: string
}) {
  const trpc = useTRPC()
  const [words, setWords] = useState(0)
  const [note, setNote] = useState(initialNote)
  // What `persist` sends, read at save time so the callback stays stable.
  const noteRef = useRef(initialNote)
  // 'waiting': the server could not be reached; tried again (item 8.5).
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error' | 'waiting'>('idle')
  // Item 8.5 — words kept on this device that the saved draft does not have.
  const [recovered, setRecovered] = useState<LocalCopy | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failures = useRef(0)
  const persistRef = useRef<() => Promise<boolean>>(async () => true)
  // The device's copy of this draft, apart from any section's.
  const localKey = `suggestion:${suggestionId}`
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A count of changes and the count the last save captured, as in the section
  // editor: a flag cleared when a save came back also cleared what was typed
  // while it was on its way (phase 12 audit).
  const edits = useRef(0)
  const persisted = useRef(0)
  const inFlight = useRef<Promise<boolean> | null>(null)

  // Item 8.5 — sent even while offline, so a failure is told, not held (as in the editor).
  const saveDraft = useMutation(
    trpc.suggestion.saveDraft.mutationOptions({ networkMode: 'always' }),
  )
  // The stable function on it, not the object, which is new every render: the
  // autosave effect below depends on `persist`, and a `persist` remade on each
  // re-render let the effect's clean-up clear the pending save (phase 14,
  // item 1.4; the section editor had the same fault).
  const { mutateAsync: saveNow } = saveDraft
  const submit = useMutation(trpc.suggestion.submit.mutationOptions())
  const edit = useMutation(trpc.suggestion.edit.mutationOptions())

  const editor = useEditor({
    extensions: extensionsFor(flavour, 'Write the passage.'),
    content: initialContent ?? undefined,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Your suggestion', role: 'textbox' } },
    onCreate: ({ editor: instance }) => {
      // The pre-filled text already has a word count; showing 0 until the first
      // keystroke would be wrong.
      setWords(countWords(instance.getText()))
      // Item 8.5 — a newer, different copy kept on this device is offered back.
      if (change) return
      // Offered whenever it differs, not by this device's clock against the
      // server's: a slow clock lost offline words (2026-10-26 final pass).
      const kept = readLocalCopy(localKey)
      if (!kept) return
      const differs = JSON.stringify(kept.contentJson) !== JSON.stringify(instance.getJSON())
      if (differs) setRecovered(kept)
      else forgetLocalCopy(localKey)
    },
    onUpdate: ({ editor: instance }) => {
      edits.current += 1
      setWords(countWords(instance.getText()))
      if (!change) keepLocalCopy(localKey, instance.getJSON())
    },
  })

  /** Saves whatever is unsaved. True when, afterwards, nothing is. */
  const persist = useCallback(async (): Promise<boolean> => {
    if (!editor) return false
    // Item 6.7 — a sent suggestion has no draft to save into; the change
    // goes as one piece when Save is pressed.
    if (change) return true
    while (inFlight.current) {
      if (!(await inFlight.current)) return false
    }
    if (edits.current === persisted.current) return true

    const at = edits.current
    const run = (async () => {
      setSaved('saving')
      try {
        await saveNow({ suggestionId, contentJson: editor.getJSON(), note: noteRef.current })
        persisted.current = at
        setSaved('saved')
        setError(null)
        failures.current = 0
        if (edits.current === persisted.current) forgetLocalCopy(localKey)
        return true
      } catch (caught) {
        // Item 8.5 — unreachable: kept on the device and tried again, sooner
        // at first; a refusal is the server's own sentence.
        if (couldNotReach(caught)) {
          setSaved('waiting')
          setError(null)
          if (!retryTimer.current) {
            const delay = Math.min(SAVE_RETRY.maxMs, SAVE_RETRY.firstMs * 2 ** failures.current)
            failures.current += 1
            retryTimer.current = setTimeout(() => {
              retryTimer.current = null
              void persistRef.current()
            }, delay)
          }
          return false
        }
        setSaved('error')
        setError(caught instanceof Error ? caught.message : 'Could not save.')
        return false
      }
    })()
    inFlight.current = run
    try {
      return await run
    } finally {
      inFlight.current = null
    }
  }, [change, editor, localKey, saveNow, suggestionId])

  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  // With anything unsaved, the browser asks before the page goes: closing the
  // tab, going back, or a save that failed (2026-10-26 final pass). Not when
  // changing a sent suggestion, where leaving without saving is the choice.
  useEffect(() => {
    if (change) return
    const onLeave = (event: BeforeUnloadEvent) => {
      if (edits.current !== persisted.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [change])

  // Item 8.5 — back online, try at once.
  useEffect(() => {
    const onOnline = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      void persistRef.current()
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

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
  // Item 6.4 — a full quota writes but does not send; the reason is under the button.
  const full = quotaFull(allowance)
  const canSend =
    inBounds &&
    noteWords <= SUGGESTION_NOTE_MAX_WORDS &&
    !submit.isPending &&
    !edit.isPending &&
    !sent &&
    (!full || change)
  const [askOpen, setAskOpen] = useState(false)
  // Item 6.6 (FR-6.3, FR-6.7) — a draft started against text that has moved
  // on says so, shows what moved, and can move its base; sending it as it is
  // asks first.
  const behind =
    baseRevisionId !== null && headRevisionId !== null && baseRevisionId !== headRevisionId
  const [showChange, setShowChange] = useState(false)
  const [confirmBehind, setConfirmBehind] = useState(false)
  const router = useRouter()
  const rebase = useMutation(
    trpc.suggestion.rebase.mutationOptions({ onSuccess: () => router.refresh() }),
  )

  async function send() {
    // What is sent is what is saved, so the latest words are saved first, and
    // nothing goes if they could not be. `send` used to start the save and
    // not wait for it, so the last seconds of typing could be missing from
    // what the author read, and the word count checked was the old one
    // (phase 12 audit).
    if (timer.current) clearTimeout(timer.current)
    if (!(await persist())) return
    try {
      if (change) {
        // Item 6.7 — the whole of it at once; the server refuses if an author
        // opened it meanwhile.
        if (!editor) return
        await edit.mutateAsync({
          suggestionId,
          contentJson: editor.getJSON(),
          note: note.trim() || undefined,
        })
      } else {
        await submit.mutateAsync({ suggestionId, note: note.trim() || undefined })
      }
      setSent(true)
      window.location.href = backHref
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send.')
    }
  }

  if (!editor) return <p className="text-[13.5px] text-ink-faint">Loading the editor…</p>

  // FR-5.6 — what must hold, and the tone. Pinned beside the prose from `lg`
  // up; above the editor below it (item 4.5), never under the Send button.
  const asked = (
    <>
      {constraints.length > 0 ? (
        <div className="border border-ochre/35 bg-ochre-wash px-4 py-3.5">
          <h2 className="text-[12px] font-medium tracking-wide text-ochre uppercase">Must hold</h2>
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

      {/* Item 6.2 — the people, under their own heading. */}
      {characterNotes ? (
        <div className="mt-4 border border-rule bg-paper-sunk px-4 py-3.5">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Characters
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
            {characterNotes}
          </p>
        </div>
      ) : null}
    </>
  )

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_17rem]">
      <div>
        <h1 className="font-manuscript text-[24px] leading-tight font-medium text-ink">
          {requestTitle}
        </h1>
        {/* Item 6.3 (FR-5.6) — the ask, its first lines, then all of it. */}
        <p
          className={
            askOpen
              ? 'mt-2 max-w-measure text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft'
              : 'mt-2 line-clamp-3 max-w-measure text-[13.5px] leading-relaxed text-ink-soft'
          }
        >
          {ask}
        </p>
        {ask.length > REQUEST_ASK_PREVIEW_CHARS ? (
          <button
            type="button"
            className="text-[12.5px] text-pencil hover:underline"
            aria-expanded={askOpen}
            onClick={() => setAskOpen((was) => !was)}
          >
            {askOpen ? 'Show less' : 'Read all'}
          </button>
        ) : null}

        {behind && baseRevisionId && headRevisionId ? (
          <div className="mt-3 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            <p>
              The section has changed since you started.
              {rewrite
                ? ' Your words stay as they are; only what they are read against moves.'
                : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="text-pencil hover:underline"
                aria-expanded={showChange}
                onClick={() => setShowChange((was) => !was)}
              >
                {showChange ? 'Hide what changed' : 'What changed'}
              </button>
              {/* A sent suggestion being changed stays against the text it
                  was sent for: the server moves only drafts, and refused the
                  button this offered (2026-10-24 final pass). */}
              {change ? (
                <span className="text-ink-soft">Yours stays against the text it was sent for.</span>
              ) : (
                <button
                  type="button"
                  className="text-pencil hover:underline disabled:text-ink-faint"
                  disabled={rebase.isPending}
                  onClick={() => rebase.mutate({ suggestionId })}
                >
                  Update my draft to the new text
                </button>
              )}
            </div>
            {rebase.isError ? (
              <p role="alert" className="mt-2 text-[13px] text-crimson">
                {rebase.error.message}
              </p>
            ) : null}
            {showChange ? (
              <div className="mt-3">
                <RevisionComparison
                  baseId={baseRevisionId}
                  targetId={headRevisionId}
                  leftLabel="When you started"
                  rightLabel="Now"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex items-center gap-3 text-[12.5px]">
          <span
            className={inBounds ? 'text-ink-faint' : 'text-ochre'}
            role="status"
            aria-live="polite"
          >
            <span className="tabular-nums">{words}</span> of {minWords}–{maxWords} words
          </span>
          <span className={saved === 'waiting' ? 'text-ochre' : 'text-ink-faint'}>
            {saved === 'saving'
              ? 'Saving'
              : saved === 'saved'
                ? 'Draft saved'
                : saved === 'waiting'
                  ? KEPT_ON_DEVICE
                  : ''}
          </span>
        </div>

        {/* FR-6.1 — nothing here is visible to anyone until it is sent. */}
        <p className="mt-4 border-l-2 border-pencil bg-pencil-wash px-4 py-2.5 text-[13px] text-ink">
          This is a private draft. Nobody can see it until you send it.
        </p>

        {/* FR-4.2 — a suggestion for a script is written element by element,
            as the script is (decision 0040). */}
        {flavour === 'screenplay' ? (
          <div className="mt-4">
            <ElementPicker editor={editor} />
          </div>
        ) : null}

        {/* Item 8.5 — words this device kept that the saved draft does not have. */}
        {recovered ? (
          <div className="mt-4 border-l-2 border-pencil bg-pencil-wash px-4 py-3 text-[13px] text-ink">
            <p>
              This device kept words you wrote here on{' '}
              {new Date(recovered.at).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              that were never saved.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  if (!editor) return
                  editor.commands.setContent(
                    recovered.contentJson as Parameters<typeof editor.commands.setContent>[0],
                  )
                  edits.current += 1
                  keepLocalCopy(localKey, editor.getJSON())
                  setWords(countWords(editor.getText()))
                  setRecovered(null)
                  void persist()
                }}
              >
                Put them back
              </Button>
              <button
                type="button"
                className="text-[12.5px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                onClick={() => {
                  forgetLocalCopy(localKey)
                  setRecovered(null)
                }}
              >
                Throw them away
              </button>
            </div>
          </div>
        ) : null}

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
            maxLength={SUGGESTION_NOTE_MAX_CHARS}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              // Saved with the draft, like the prose, so leaving keeps it
              // (item 1.11).
              noteRef.current = event.target.value
              edits.current += 1
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => void persist(), AUTOSAVE_IDLE_MS)
            }}
            // Saved on leaving the box too, as the prose is: the timer alone
            // lost a note typed in the three seconds before "Leave it as a
            // draft" (2026-10-26 final pass).
            onBlur={() => void persist()}
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
          <Button
            variant="primary"
            size="lg"
            disabled={!canSend}
            onClick={() => {
              if (behind && !change) setConfirmBehind(true)
              else void send()
            }}
          >
            {change
              ? edit.isPending
                ? 'Saving'
                : 'Save the change'
              : submit.isPending
                ? 'Sending'
                : 'Send this to the author'}
          </Button>
          <a
            href={backHref}
            className="text-[13.5px] text-pencil hover:underline"
            onClick={(event) => {
              if (change) return
              // A draft is left once it is saved. If the save fails, leaving
              // meets the browser's own question below rather than losing it.
              event.preventDefault()
              void persistRef.current().then(() => window.location.assign(backHref))
            }}
          >
            {change ? 'Back without changing it' : 'Leave it as a draft'}
          </a>
        </div>
        <ConfirmDialog
          open={confirmBehind}
          title="Send it against the new text?"
          confirmLabel="Send it anyway"
          busy={submit.isPending}
          error={submit.error}
          onCancel={() => setConfirmBehind(false)}
          onConfirm={() => {
            setConfirmBehind(false)
            void send()
          }}
        >
          <p>
            The section changed since you started this. The author will read your words against what
            it says now, and may find them out of step with it.
          </p>
          <p>Update my draft to the new text, above, moves it first; your words stay yours.</p>
        </ConfirmDialog>
        {allowance ? (
          <p className="mt-2 text-[12.5px] text-ink-faint">
            {allowanceLine(allowance)}
            {full ? ` ${quotaFullLine(allowance)}` : ''}
          </p>
        ) : null}
        {!inBounds ? (
          <p className="mt-2 text-[12.5px] text-ochre">
            {words < minWords
              ? `${String(minWords - words)} more words before you can send it.`
              : `${String(words - maxWords)} words over the limit.`}
          </p>
        ) : null}
      </div>

      {/* FR-5.6 — pinned, so they stay visible while the prose is written.
          Below `lg` (item 4.5) the same panel sits first, above the editor,
          as a disclosure that starts open: the same checkboxes, one state. */}
      {constraints.length > 0 || toneNotes || characterNotes ? (
        <aside className="order-first lg:sticky lg:top-8 lg:order-none lg:self-start">
          <details open className="lg:hidden">
            <summary className="cursor-pointer text-[12px] font-medium tracking-wide text-ink-faint uppercase">
              What the author asked for
            </summary>
            <div className="mt-3">{asked}</div>
          </details>
          <div className="hidden lg:block">{asked}</div>
        </aside>
      ) : null}
    </div>
  )
}
