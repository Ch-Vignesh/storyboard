'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocFlavour } from '@/lib/doc/schema'
import { ElementPicker } from '@/components/element-picker'
import { extensionsFor } from '@/lib/doc/tiptap'
import {
  DRAFT_IDLE_SECONDS,
  REVISION_INTERVAL_MINUTES,
  SAVE_RETRY,
  SECTION_WORDS,
} from '@/lib/schemas/constants'
import {
  couldNotReach,
  forgetLocalCopy,
  KEPT_ON_DEVICE,
  keepLocalCopy,
  readLocalCopy,
  type LocalCopy,
} from '@/lib/unsaved'
import { useTRPC } from '@/trpc/client'

const DRAFT_IDLE_MS = DRAFT_IDLE_SECONDS * 1000
const REVISION_INTERVAL_MS = REVISION_INTERVAL_MINUTES * 60 * 1000

/** Another section to go to, with what to call it. */
type Neighbour = { href: string; label: string }

type Props = {
  sectionId: string
  flavour: DocFlavour
  initialContent: unknown
  baseRevisionId: string | null
  /** False when this is someone else's section: drafts only, no revisions (FR-4.5). */
  canCommit: boolean
  /**
   * The editor opens on a draft, not on the saved text, so what is on screen
   * is already unsaved. Without this, nothing counted as changed until a
   * keystroke, and Save now, blur and leaving all skipped it: the draft was
   * never saved and the story went on showing the older text (2026-10-16).
   */
  startsUnsaved?: boolean
  /** Item 8.1 — where "Back to the story" goes: this section's own address. */
  returnHref: string
  /** Item 8.1 — the sections before and after this one, across chapters. */
  previous?: Neighbour | null
  next?: Neighbour | null
  /**
   * Item 8.5 — when the text this opened on was saved (the draft's time, or
   * the version's), so a copy kept on this device is offered back only when
   * it is newer.
   */
  savedAt?: string | null
  /** Item 8.6 — where to go when this section has left the story. */
  contentsHref: string
  /** Item 8.5 — the person writing, so the device keeps each person's words apart. */
  writerId: string
}

type SaveState =
  | 'idle'
  | 'draft-saving'
  | 'draft-saved'
  | 'saving'
  | 'saved'
  | 'error'
  /** Item 8.5 — the server could not be reached; trying again. */
  | 'waiting'

/** True when `target` is a node inside `container`. */
function within(container: Element | null, target: EventTarget | null): boolean {
  return container !== null && target instanceof Node && container.contains(target)
}

/** Item 8.11 — ⌘ on a Mac, Ctrl everywhere else. Only ever drawn in the browser. */
function modifierKey(): '⌘' | 'Ctrl' {
  return /Mac|iPhone|iPad/u.test(navigator.platform) ? '⌘' : 'Ctrl'
}

/**
 * FR-4.4, FR-4.5, FR-4.6 and FR-2.5.
 *
 * Two kinds of save, deliberately different:
 *
 * - A **draft** after 3 seconds of inactivity. Private to you, per section, and
 *   available to anyone who can read the storyboard — opening the editor on
 *   someone else's section never touches their text (FR-4.5).
 * - A **revision** on blur, on navigation, or every 5 minutes of continuous
 *   editing. Durable, immutable and attributed. Only for people who may edit.
 *
 * Phase 14, item 8.5 — and neither is lost to a bad connection: the words are
 * kept on this device until a save has them all, a save that could not reach
 * the server is tried again, and a page that opens on older text offers the
 * kept words back.
 */
export function SectionEditor({
  sectionId,
  flavour,
  initialContent,
  baseRevisionId,
  canCommit,
  returnHref,
  previous = null,
  next = null,
  savedAt = null,
  contentsHref,
  writerId,
  startsUnsaved = false,
}: Props) {
  const trpc = useTRPC()
  const router = useRouter()
  const localKey = `${writerId}:${sectionId}`
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  // Item 8.6 — the section was removed or joined away while this was open.
  const [gone, setGone] = useState(false)
  // Item 8.5 — words kept on this device that the saved text does not have.
  const [recovered, setRecovered] = useState<LocalCopy | null>(null)
  // Item 8.6 — the same section open in another tab of this browser.
  const [otherTab, setOtherTab] = useState(false)
  const [words, setWords] = useState(0)
  // The revision this editor's text is written on. A ref, not state: two saves
  // in a row must each see the head the one before it made, not the value from
  // the last render.
  const head = useRef(baseRevisionId)

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revisionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failures = useRef(0)
  // A count of changes, and the count each kind of save last captured. A
  // single "dirty" flag, cleared when a save came back, also cleared whatever
  // was typed while that save was on its way: the last edit before leaving
  // (an Italic click, which blurs the editor and so starts a save first) was
  // reported as saved and never was (phase 12 audit).
  const edits = useRef(startsUnsaved ? 1 : 0)
  const committed = useRef(0)
  // A draft it opened on is already drafted; only the revision is owed.
  const drafted = useRef(startsUnsaved ? 1 : 0)
  const unsaved = () => edits.current !== committed.current
  // Everything typed is on the server, as a version or as a draft.
  const allKept = () => edits.current === (canCommit ? committed.current : drafted.current)
  // Two saves of the same section at once open two transactions on one row and
  // deadlock, so one runs at a time. A second caller waits for the first and
  // then saves whatever is still unsaved, rather than being dropped.
  const inFlight = useRef<Promise<boolean> | null>(null)
  // Nor does a draft save overlap a save of the text. A draft records the
  // revision it is written on; one sent while a save was moving the head
  // recorded the revision before it, or landed after the save had cleared the
  // draft away, and the writer's own draft then looked overtaken.
  const draftInFlight = useRef<Promise<void> | null>(null)

  // Set once the draft this editor opened on is being thrown away: no save of
  // any kind may run after that, or the draft would be kept as a version.
  const discarded = useRef(false)
  const discardDraft = useMutation(trpc.section.discardDraft.mutationOptions())

  // Item 8.5 — sent even while the browser says it is offline: the query
  // library would otherwise hold them, silently, until it came back, and the
  // writer would watch "Saving" for as long as that took.
  const saveDraft = useMutation(trpc.section.saveDraft.mutationOptions({ networkMode: 'always' }))
  const splitSection = useMutation(trpc.section.split.mutationOptions())
  const commitRevision = useMutation(
    trpc.section.commitRevision.mutationOptions({ networkMode: 'always' }),
  )
  // `useMutation` hands back a new object every render, and the two save
  // callbacks below used to depend on those objects. So every re-render (a
  // word count, a save status) remade them, the effects that own the timers
  // re-ran, and their clean-up cleared a pending draft save or the five-minute
  // revision: a save whose status arrived after the last keystroke cancelled
  // the draft that keystroke had scheduled. The functions on them are stable,
  // so the callbacks depend on those instead (phase 14, item 1.4).
  const { mutateAsync: writeDraftNow } = saveDraft
  const { mutateAsync: commitRevisionNow } = commitRevision
  // The formatting toolbar. Focus moving into it is not leaving the editor.
  const toolbar = useRef<HTMLDivElement>(null)
  // Item 8.5 — whatever saves everything, for the retry and the `online`
  // event, which outlive any one render.
  const saveEverything = useRef<() => Promise<boolean>>(async () => true)

  const editor = useEditor({
    extensions: extensionsFor(flavour),
    content: initialContent ?? undefined,
    // Next.js renders this on the server first; TipTap must not.
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Section text', role: 'textbox' } },
    // The count of what is there when it opens, not 0 until the first
    // keystroke: FR-2.5's over-2000 note has to show on a long section at once.
    onCreate: ({ editor: instance }) => {
      setWords(countWordsIn(instance.getText()))
      // Item 8.5 — words kept on this device from an earlier visit, newer
      // than the text this opened on and different from it, are offered back.
      const kept = readLocalCopy(localKey)
      if (!kept) return
      const openedOn = savedAt ? Date.parse(savedAt) : 0
      const differs = JSON.stringify(kept.contentJson) !== JSON.stringify(instance.getJSON())
      if (kept.at > openedOn && differs) setRecovered(kept)
      else forgetLocalCopy(localKey)
    },
    onUpdate: ({ editor: instance }) => {
      edits.current += 1
      setWords(countWordsIn(instance.getText()))
      // Item 8.5 — on this device until a save has it.
      keepLocalCopy(localKey, instance.getJSON())
    },
  })

  /** Item 8.5 — a save went through: the device's copy can go once nothing is owed. */
  const succeeded = useCallback(() => {
    failures.current = 0
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    if (allKept()) forgetLocalCopy(localKey)
    // `allKept` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey])

  /**
   * Item 8.5 — what a failed save tells the writer. The server unreachable:
   * the words are on this device and it tries again, sooner at first. A
   * refusal: the server's own sentence; and a section that has left the story
   * leads to the contents rather than to a position that now means another
   * section (item 8.6).
   */
  const failed = useCallback((caught: unknown) => {
    if (couldNotReach(caught)) {
      setState('waiting')
      setError(null)
      if (!retryTimer.current) {
        const delay = Math.min(SAVE_RETRY.maxMs, SAVE_RETRY.firstMs * 2 ** failures.current)
        failures.current += 1
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null
          void saveEverything.current()
        }, delay)
      }
      return
    }
    setState('error')
    const code =
      caught instanceof TRPCClientError
        ? (caught.data as { code?: string } | undefined)?.code
        : undefined
    if (code === 'NOT_FOUND') setGone(true)
    setError(caught instanceof Error ? caught.message : 'Could not save.')
  }, [])

  /** Write the draft. Cheap, frequent, private. */
  const writeDraft = useCallback(async () => {
    if (discarded.current) return
    if (!editor || edits.current === drafted.current || draftInFlight.current) return
    const run = (async () => {
      while (inFlight.current) await inFlight.current
      // The save just waited for may have taken everything there was.
      if (edits.current === drafted.current) return
      const at = edits.current
      setState('draft-saving')
      try {
        await writeDraftNow({
          sectionId,
          contentJson: editor.getJSON(),
          baseRevisionId: head.current,
        })
        drafted.current = Math.max(drafted.current, at)
        setState('draft-saved')
        setError(null)
        succeeded()
      } catch (caught) {
        failed(caught)
      }
    })()
    draftInFlight.current = run
    try {
      await run
    } finally {
      draftInFlight.current = null
    }
  }, [editor, failed, sectionId, succeeded, writeDraftNow])

  /**
   * Cut a durable revision of whatever is unsaved. True when, afterwards,
   * nothing is: either it saved, or there was nothing to save.
   */
  const commit = useCallback(
    async (asked = false): Promise<boolean> => {
      if (!editor || !canCommit || discarded.current) return false
      // Until neither kind of save is on its way. Checked again after every
      // wait, and nothing awaited between the last check and claiming
      // `inFlight` below, so two saves can never both get through.
      for (;;) {
        if (inFlight.current) {
          if (!(await inFlight.current)) return false
        } else if (draftInFlight.current) {
          await draftInFlight.current
        } else {
          break
        }
      }
      if (!unsaved()) {
        // "Save now" with everything saved says so, rather than whatever the
        // last draft save said.
        if (asked) setState('saved')
        return true
      }

      const at = edits.current
      const run = (async () => {
        setState('saving')
        try {
          const result = await commitRevisionNow({
            sectionId,
            contentJson: editor.getJSON(),
            baseRevisionId: head.current,
          })
          if (result.revisionId) head.current = result.revisionId
          // What this save captured, not whatever has been typed since.
          committed.current = at
          drafted.current = Math.max(drafted.current, at)
          setState(unsaved() ? 'idle' : 'saved')
          setError(null)
          succeeded()
          return true
        } catch (caught) {
          failed(caught)
          return false
        }
      })()
      inFlight.current = run
      try {
        return await run
      } finally {
        inFlight.current = null
      }
    },
    [canCommit, commitRevisionNow, editor, failed, sectionId, succeeded],
  )

  useEffect(() => {
    saveEverything.current = async () => {
      if (canCommit) return commit()
      await writeDraft()
      return edits.current === drafted.current
    }
  }, [canCommit, commit, writeDraft])

  /**
   * Item 8.1 (FR-4.4) — a link inside the editor saves first, then goes. A
   * refusal keeps the writer here to read it; a save that could not reach the
   * server goes anyway, since the words are kept on this device and offered
   * back next time.
   */
  const leave = useCallback(
    async (href: string) => {
      const saved = await saveEverything.current()
      // Refused, not merely unreachable: stay, with the server's sentence.
      const waiting = retryTimer.current !== null
      if (!saved && !waiting) return
      router.push(href)
    },
    [router],
  )

  /**
   * FR-2.4 — split at the cursor. The text has to be durable before it can be
   * divided, so this commits first and then asks the server to cut the document
   * at the top-level block the caret sits in. If it could not be saved, there
   * is nothing safe to split: the server would cut the last saved text and
   * leave this person's latest words out of both halves (phase 12 audit).
   */
  const splitHere = useCallback(async () => {
    if (!editor || !canCommit) return
    if (!(await commit())) return
    const { $from } = editor.state.selection
    // depth 1 is the top-level block; its index is the cut point.
    const atBlockIndex = $from.index(0)
    if (atBlockIndex < 1) {
      setState('error')
      setError('Put the cursor where the new section should start.')
      return
    }
    try {
      await splitSection.mutateAsync({ sectionId, atBlockIndex })
      // Item 8.1 — back to this section's own address, not chapter one.
      window.location.href = returnHref
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : 'Could not split the section.')
    }
  }, [canCommit, commit, editor, returnHref, sectionId, splitSection])

  /**
   * Back to the saved text. Every save is stood down first, and nothing is
   * left counted as unsaved, so neither a timer, a blur nor leaving the page
   * can keep the draft as a version on its way out.
   */
  const throwDraftAway = useCallback(async () => {
    discarded.current = true
    if (draftTimer.current) clearTimeout(draftTimer.current)
    if (revisionTimer.current) clearInterval(revisionTimer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    committed.current = edits.current
    drafted.current = edits.current
    forgetLocalCopy(localKey)
    try {
      // Whatever was already on its way finishes first.
      if (inFlight.current) await inFlight.current
      if (draftInFlight.current) await draftInFlight.current
      await discardDraft.mutateAsync({ sectionId })
      window.location.reload()
    } catch (caught) {
      discarded.current = false
      setState('error')
      setError(caught instanceof Error ? caught.message : 'Could not throw the draft away.')
    }
  }, [discardDraft, localKey, sectionId])

  // FR-4.4 — a draft after 3 seconds of inactivity.
  useEffect(() => {
    if (!editor) return
    const onUpdate = () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = setTimeout(() => void writeDraft(), DRAFT_IDLE_MS)
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [editor, writeDraft])

  // FR-4.4 — a revision on blur, and every 5 minutes of continuous editing.
  useEffect(() => {
    if (!editor || !canCommit) return
    // Focus moving into the toolbar is not leaving the editor. Its buttons
    // never take focus (see ToolbarButton), but a script's Element control is
    // a <select>, which must, and choosing an element saved a version each
    // time (phase 14, item 1.4). The toolbar's own blur saves instead, once
    // focus has gone somewhere else altogether.
    const onBlur = ({ event }: { event: FocusEvent }) => {
      if (within(toolbar.current, event.relatedTarget)) return
      void commit()
    }
    editor.on('blur', onBlur)
    revisionTimer.current = setInterval(() => void commit(), REVISION_INTERVAL_MS)
    return () => {
      editor.off('blur', onBlur)
      if (revisionTimer.current) clearInterval(revisionTimer.current)
    }
  }, [canCommit, commit, editor])

  // Item 8.5 — back online, try at once rather than waiting out the backoff.
  useEffect(() => {
    const onOnline = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      if (!allKept()) void saveEverything.current()
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
    // `allKept` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const putBack = useCallback(() => {
    if (!editor || !recovered) return
    editor.commands.setContent(
      recovered.contentJson as Parameters<typeof editor.commands.setContent>[0],
    )
    // Unsaved now, whether or not setting it counted as an edit.
    edits.current += 1
    keepLocalCopy(localKey, editor.getJSON())
    setWords(countWordsIn(editor.getText()))
    setRecovered(null)
    void saveEverything.current()
  }, [editor, localKey, recovered])

  // Item 8.6 — the same section open in another tab of this browser: both
  // say so, since a save in one can make the other's refuse.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`draftboard:section:${sectionId}`)
    const me = Math.random().toString(36).slice(2)
    channel.onmessage = (event: MessageEvent<{ kind: string; from: string }>) => {
      if (event.data.from === me) return
      if (event.data.kind === 'open') {
        setOtherTab(true)
        channel.postMessage({ kind: 'here', from: me })
      } else if (event.data.kind === 'here') {
        setOtherTab(true)
      } else if (event.data.kind === 'closed') {
        setOtherTab(false)
      }
    }
    channel.postMessage({ kind: 'open', from: me })
    return () => {
      channel.postMessage({ kind: 'closed', from: me })
      channel.close()
    }
  }, [sectionId])

  // FR-4.4 — and on navigation away. With anything unsaved, the browser also
  // asks before the tab closes: the beacon below is a best effort, and a
  // refused save (somebody else changed the section) cannot be shown to a
  // page that has gone. Item 8.5 — the beacon also goes when the editor is
  // left by a link outside it (the site header), which unmounts it without a
  // `pagehide`.
  useEffect(() => {
    const sendBeacon = () => {
      if (!unsaved() || !editor || !canCommit || discarded.current) return
      // A keepalive beacon: the page may be gone before a promise settles.
      navigator.sendBeacon?.(
        '/api/section/save-beacon',
        new Blob(
          [
            JSON.stringify({
              sectionId,
              contentJson: editor.getJSON(),
              baseRevisionId: head.current,
            }),
          ],
          { type: 'application/json' },
        ),
      )
    }
    const onLeave = (event: BeforeUnloadEvent) => {
      if (unsaved() && edits.current !== drafted.current) event.preventDefault()
    }
    window.addEventListener('pagehide', sendBeacon)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('pagehide', sendBeacon)
      window.removeEventListener('beforeunload', onLeave)
      // Left by a link outside the editor, with words not even drafted yet.
      // (Not merely undrafted-as-a-version: a page opened on a draft, left
      // at once, keeps it as the draft it was.)
      if (edits.current !== drafted.current) sendBeacon()
    }
  }, [canCommit, editor, sectionId])

  if (!editor) return <p className="text-[13.5px] text-ink-faint">Loading the editor…</p>

  const over = words > SECTION_WORDS.softMax
  const mod = modifierKey()
  const shortcuts = {
    italic: `${mod} I`,
    bold: `${mod} B`,
    quote: `${mod} Shift B`,
    sceneBreak: `${mod} Enter`,
  }

  return (
    <div>
      {/* Item 8.6 */}
      {otherTab ? (
        <p
          role="status"
          className="mb-4 border-l-2 border-ochre bg-ochre-wash px-4 py-2.5 text-[13px] text-ink"
        >
          This section is open in another tab. Write in one of them: a save in one can make the
          other&rsquo;s refuse.
        </p>
      ) : null}

      {/* Item 8.5 */}
      {recovered ? (
        <div className="mb-4 border-l-2 border-pencil bg-pencil-wash px-4 py-3 text-[13px] text-ink">
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
            <Button size="sm" variant="primary" onClick={putBack}>
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

      {/* FR-4.6 — italic, bold, quote, scene break. Nothing else. This is a
          manuscript, not a document. A script also names its elements
          (FR-4.2, decision 0040). */}
      <div
        ref={toolbar}
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-1 border-b border-rule bg-paper/95 px-2 py-2 backdrop-blur"
        onBlur={(event) => {
          // Focus leaving the toolbar for anywhere but the editor is leaving
          // the editor: the save its own blur stood down (above) runs now.
          const target = event.relatedTarget
          if (within(toolbar.current, target) || within(editor.view.dom, target)) return
          if (canCommit) void commit()
        }}
      >
        {flavour === 'screenplay' ? (
          <span className="mr-2">
            <ElementPicker editor={editor} />
          </span>
        ) : null}
        <ToolbarButton
          label="Italic"
          shortcut={shortcuts.italic}
          active={editor.isActive('em')}
          onClick={() => editor.chain().focus().toggleMark('em').run()}
        >
          <span className="font-manuscript italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Bold"
          shortcut={shortcuts.bold}
          active={editor.isActive('strong')}
          onClick={() => editor.chain().focus().toggleMark('strong').run()}
        >
          <span className="font-manuscript font-semibold">B</span>
        </ToolbarButton>
        {flavour !== 'screenplay' ? (
          <ToolbarButton
            label="Quote"
            shortcut={shortcuts.quote}
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleWrap('blockquote').run()}
          >
            <span className="font-manuscript">&rdquo;</span>
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          label="Scene break"
          shortcut={shortcuts.sceneBreak}
          active={false}
          onClick={() => editor.chain().focus().insertContent({ type: 'scene_break' }).run()}
        >
          <span className="tracking-widest">***</span>
        </ToolbarButton>

        {canCommit ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-1"
            onClick={() => void splitHere()}
            title="Everything from the cursor down becomes a new section"
          >
            Split here
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-3 text-[12.5px]">
          <span
            aria-live="polite"
            className={state === 'waiting' ? 'text-ochre' : 'text-ink-faint'}
          >
            {describe(state, canCommit)}
          </span>
          {canCommit ? (
            <Button size="sm" variant="primary" onClick={() => void commit(true)}>
              Save now
            </Button>
          ) : null}
        </div>
      </div>

      {!canCommit ? (
        // FR-4.5, stated plainly rather than discovered.
        <p className="mt-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13px] leading-relaxed text-ink">
          This is not your section. What you write here is a private draft that only you can see —
          the author&rsquo;s text is untouched.
        </p>
      ) : null}

      <div className="manuscript mt-6 max-w-measure">
        <EditorContent editor={editor} />
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
        <p className={over ? 'text-[13px] text-ochre' : 'text-[13px] text-ink-faint'}>
          <span className="tabular-nums">{words.toLocaleString('en-GB')}</span> words
          {/* FR-2.5 — warn above 2000, never block. */}
          {over ? (
            <span className="ml-2">
              Long sections are harder for someone to help with. Splitting it is often easier.
            </span>
          ) : null}
        </p>
        <span className="flex items-center gap-4">
          {/* FR-4.5 — the draft this opened on can be thrown away, back to
              the saved text. `section.discardDraft` had no caller until the
              2026-10-16 spec review. */}
          {startsUnsaved && !discarded.current ? (
            <button
              type="button"
              className="text-[12.5px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
              // Keeps the editor focused: its blur would save the draft as a
              // version a moment before it was thrown away.
              onMouseDown={(event) => event.preventDefault()}
              disabled={discardDraft.isPending}
              onClick={() => void throwDraftAway()}
            >
              {discardDraft.isPending ? 'Throwing it away' : 'Throw this draft away'}
            </button>
          ) : null}
          <LeaveLink href={returnHref} onLeave={leave}>
            Back to the story
          </LeaveLink>
        </span>
      </footer>

      {/* Item 8.1 — on through the story, a section at a time, saving first. */}
      {previous || next ? (
        <nav
          aria-label="Sections"
          className="mt-4 flex items-center justify-between gap-4 text-[13px]"
        >
          {previous ? (
            <LeaveLink href={previous.href} onLeave={leave}>
              ← Previous section: {previous.label}
            </LeaveLink>
          ) : (
            <span />
          )}
          {next ? (
            <LeaveLink href={next.href} onLeave={leave}>
              Next section: {next.label} →
            </LeaveLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {error}
          {/* Item 8.6 — a position address now names another section. */}
          {gone ? (
            <>
              {' '}
              <a href={contentsHref} className="text-pencil underline">
                Go to the story&rsquo;s contents
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {/* Item 8.11 */}
      <details className="mt-8 text-[12.5px] text-ink-faint">
        <summary className="cursor-pointer hover:text-ink">Keyboard shortcuts</summary>
        <dl className="mt-2 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Italic</dt>
          <dd className="tabular-nums">{shortcuts.italic}</dd>
          <dt>Bold</dt>
          <dd className="tabular-nums">{shortcuts.bold}</dd>
          {flavour !== 'screenplay' ? (
            <>
              <dt>Quote</dt>
              <dd className="tabular-nums">{shortcuts.quote}</dd>
            </>
          ) : null}
          <dt>Scene break</dt>
          <dd className="tabular-nums">{shortcuts.sceneBreak}</dd>
        </dl>
      </details>
    </div>
  )
}

/**
 * Item 8.1 — a link out of the editor that saves before it goes. A plain
 * `<a>` underneath, so a middle click or "open in new tab" still works.
 */
function LeaveLink({
  href,
  onLeave,
  children,
}: {
  href: string
  onLeave: (href: string) => Promise<void>
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="text-pencil hover:underline"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        void onLeave(href)
      }}
    >
      {children}
    </a>
  )
}

function ToolbarButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={`${label} (${shortcut})`}
      aria-label={label}
      aria-keyshortcuts={shortcut.replace('⌘', 'Meta').replaceAll(' ', '+')}
      aria-pressed={active}
      // Keeps the editor focused. A click that blurred it saved a version
      // first, so typing and then pressing Italic put two near-identical
      // versions in History (phase 14, item 1.4). The discard button in the
      // footer does the same.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={
        active
          ? 'flex size-8 items-center justify-center rounded-control border border-pencil bg-pencil-wash text-[14px] text-pencil'
          : 'flex size-8 items-center justify-center rounded-control border border-transparent text-[14px] text-ink-soft hover:border-rule hover:text-ink'
      }
    >
      {children}
    </button>
  )
}

function describe(state: SaveState, canCommit: boolean): string {
  switch (state) {
    case 'draft-saving':
      return 'Saving'
    case 'draft-saved':
      return canCommit ? 'Draft saved' : 'Private draft saved'
    case 'saving':
      return 'Saving'
    case 'saved':
      return 'Saved'
    case 'error':
      return 'Not saved'
    case 'waiting':
      return KEPT_ON_DEVICE
    case 'idle':
      return ''
  }
}

/**
 * The live counter only. The stored count comes from `derive()` on the server,
 * which is the number of record; this is the same rule applied to the editor's
 * plain text so the two agree while typing.
 */
function countWordsIn(text: string): number {
  if (text.trim().length === 0) return 0
  let count = 0
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1
  }
  return count
}
