'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocFlavour } from '@/lib/doc/schema'
import { extensionsFor } from '@/lib/doc/tiptap'
import { SECTION_WORDS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

const DRAFT_IDLE_MS = 3_000
const REVISION_INTERVAL_MS = 5 * 60 * 1000

type Props = {
  sectionId: string
  flavour: DocFlavour
  initialContent: unknown
  baseRevisionId: string | null
  /** False when this is someone else's section: drafts only, no revisions (FR-4.5). */
  canCommit: boolean
  /** Where "done" goes. */
  returnHref: string
}

type SaveState = 'idle' | 'draft-saving' | 'draft-saved' | 'saving' | 'saved' | 'error'

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
 */
export function SectionEditor({
  sectionId,
  flavour,
  initialContent,
  baseRevisionId,
  canCommit,
  returnHref,
}: Props) {
  const trpc = useTRPC()
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [words, setWords] = useState(0)
  const [head, setHead] = useState(baseRevisionId)

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revisionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const dirty = useRef(false)
  // Clicking "Save now" blurs the editor, so the blur handler and the click
  // handler fire together. Two saves of the same section open two transactions
  // on the same row and deadlock, so only one runs at a time. The second is
  // dropped rather than queued: it would be writing identical content, and
  // anything typed since stays dirty for the next save.
  const saving = useRef(false)
  const savingDraft = useRef(false)

  const saveDraft = useMutation(trpc.section.saveDraft.mutationOptions())
  const splitSection = useMutation(trpc.section.split.mutationOptions())
  const commitRevision = useMutation(trpc.section.commitRevision.mutationOptions())

  const editor = useEditor({
    extensions: extensionsFor(flavour),
    content: initialContent ?? undefined,
    // Next.js renders this on the server first; TipTap must not.
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Section text', role: 'textbox' } },
    onUpdate: ({ editor: instance }) => {
      dirty.current = true
      setWords(countWordsIn(instance.getText()))
    },
  })

  /** Write the draft. Cheap, frequent, private. */
  const writeDraft = useCallback(async () => {
    if (!editor || !dirty.current || savingDraft.current) return
    savingDraft.current = true
    setState('draft-saving')
    try {
      await saveDraft.mutateAsync({ sectionId, contentJson: editor.getJSON() })
      setState('draft-saved')
      setError(null)
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      savingDraft.current = false
    }
  }, [editor, saveDraft, sectionId])

  /** Cut a durable revision. */
  const commit = useCallback(async () => {
    if (!editor || !canCommit || !dirty.current || saving.current) return
    saving.current = true
    setState('saving')
    try {
      const result = await commitRevision.mutateAsync({
        sectionId,
        contentJson: editor.getJSON(),
        baseRevisionId: head,
      })
      if (result.revisionId) setHead(result.revisionId)
      dirty.current = false
      setState('saved')
      setError(null)
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      saving.current = false
    }
  }, [canCommit, commitRevision, editor, head, sectionId])

  /**
   * FR-2.4 — split at the cursor. The text has to be durable before it can be
   * divided, so this commits first and then asks the server to cut the document
   * at the top-level block the caret sits in.
   */
  const splitHere = useCallback(async () => {
    if (!editor || !canCommit) return
    await commit()
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
      window.location.href = returnHref
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : 'Could not split the section.')
    }
  }, [canCommit, commit, editor, returnHref, sectionId, splitSection])

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
    const onBlur = () => void commit()
    editor.on('blur', onBlur)
    revisionTimer.current = setInterval(() => void commit(), REVISION_INTERVAL_MS)
    return () => {
      editor.off('blur', onBlur)
      if (revisionTimer.current) clearInterval(revisionTimer.current)
    }
  }, [canCommit, commit, editor])

  // FR-4.4 — and on navigation away.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current || !editor) return
      // A keepalive beacon: the page may be gone before a promise settles.
      navigator.sendBeacon?.(
        '/api/section/save-beacon',
        new Blob(
          [JSON.stringify({ sectionId, contentJson: editor.getJSON(), baseRevisionId: head })],
          { type: 'application/json' },
        ),
      )
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [editor, head, sectionId])

  if (!editor) return <p className="text-[13.5px] text-ink-faint">Loading the editor…</p>

  const over = words > SECTION_WORDS.softMax

  return (
    <div>
      {/* FR-4.6 — italic, bold, quote, scene break. Nothing else. This is a
          manuscript, not a document. */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 -mx-2 flex items-center gap-1 border-b border-rule bg-paper/95 px-2 py-2 backdrop-blur"
      >
        <ToolbarButton
          label="Italic"
          shortcut="Ctrl I"
          active={editor.isActive('em')}
          onClick={() => editor.chain().focus().toggleMark('em').run()}
        >
          <span className="font-manuscript italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Bold"
          shortcut="Ctrl B"
          active={editor.isActive('strong')}
          onClick={() => editor.chain().focus().toggleMark('strong').run()}
        >
          <span className="font-manuscript font-semibold">B</span>
        </ToolbarButton>
        {flavour !== 'screenplay' ? (
          <ToolbarButton
            label="Quote"
            shortcut="Ctrl Shift B"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleWrap('blockquote').run()}
          >
            <span className="font-manuscript">&rdquo;</span>
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          label="Scene break"
          shortcut="Ctrl Enter"
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
          <span aria-live="polite" className="text-ink-faint">
            {describe(state, canCommit)}
          </span>
          {canCommit ? (
            <Button size="sm" variant="primary" onClick={() => void commit()}>
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

      <footer className="mt-8 flex items-center justify-between border-t border-rule pt-4">
        <p className={over ? 'text-[13px] text-ochre' : 'text-[13px] text-ink-faint'}>
          <span className="tabular-nums">{words.toLocaleString('en-GB')}</span> words
          {/* FR-2.5 — warn above 2000, never block. */}
          {over ? (
            <span className="ml-2">
              Long sections are harder for someone to help with. Splitting it is often easier.
            </span>
          ) : null}
        </p>
        <a href={returnHref} className="text-[13.5px] text-pencil hover:underline">
          Back to the storyboard
        </a>
      </footer>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {error}
        </p>
      ) : null}
    </div>
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
      aria-pressed={active}
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
