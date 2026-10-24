'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { requestsSentence } from '@/lib/impact-words'
import { SOFT_DELETE_GRACE_DAYS, TITLE_MAX_CHARS } from '@/lib/schemas/constants'
import type { Person } from '@/lib/people'
import { useTRPC } from '@/trpc/client'

type Section = {
  id: string
  order: number
  title: string | null
  wordCount: number
}

type Chapter = {
  id: string
  order: number
  title: string
  sections: Section[]
}

export function ContentsEditor({
  slug,
  versionId,
  versionQuery,
  chapters: initialChapters,
}: {
  slug: string
  versionId: string
  /** `?version=…` while rearranging an alternate, so links out stay in it; else empty. */
  versionQuery: string
  chapters: Chapter[]
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [chapters, setChapters] = useState(initialChapters)
  // `router.refresh()` brings the server's new list as a new prop, and state
  // seeded from a prop never looks at it again. So after a join, an added
  // section or a new chapter the screen showed nothing new, and people did it
  // again: a second "Join with the one above" put the same text in twice
  // (phase 12 audit). Take the server's list whenever it changes.
  const [shown, setShown] = useState(initialChapters)
  if (initialChapters !== shown) {
    setShown(initialChapters)
    setChapters(initialChapters)
  }
  const [newChapterTitle, setNewChapterTitle] = useState('')
  // Item 5.2 — what is about to be removed or joined, while the dialog asks.
  const [pending, setPending] = useState<{
    kind: 'chapter' | 'section' | 'join'
    id: string
    name: string
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // NFR-4 — reordering has to work from the keyboard, not only a mouse.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const refresh = () => router.refresh()

  const reorderChapters = useMutation(trpc.chapter.reorder.mutationOptions({ onSuccess: refresh }))
  const reorderSections = useMutation(trpc.section.reorder.mutationOptions({ onSuccess: refresh }))
  const createChapter = useMutation(
    trpc.chapter.create.mutationOptions({
      onSuccess: () => {
        setNewChapterTitle('')
        refresh()
      },
    }),
  )
  const renameChapter = useMutation(trpc.chapter.rename.mutationOptions({ onSuccess: refresh }))
  const deleteChapter = useMutation(
    trpc.chapter.delete.mutationOptions({
      onSuccess: () => {
        setPending(null)
        refresh()
      },
    }),
  )
  const createSection = useMutation(trpc.section.create.mutationOptions({ onSuccess: refresh }))
  // Item 8.3 (FR-2.3) — a section to another chapter, or another place in its
  // own, by a form as well as by dragging, which is also the keyboard's way.
  const [moving, setMoving] = useState<{
    sectionId: string
    toChapterId: string
    position: number
  } | null>(null)
  const moveSection = useMutation(
    trpc.section.move.mutationOptions({
      onSuccess: () => {
        setMoving(null)
        refresh()
      },
    }),
  )
  const renameSection = useMutation(trpc.section.rename.mutationOptions({ onSuccess: refresh }))
  const deleteSection = useMutation(
    trpc.section.delete.mutationOptions({
      onSuccess: () => {
        setPending(null)
        refresh()
      },
    }),
  )
  const joinSection = useMutation(
    trpc.section.joinWithPrevious.mutationOptions({
      onSuccess: () => {
        setPending(null)
        refresh()
      },
    }),
  )
  // The consequences, from the server, for the dialog (item 5.2).
  const chapterImpact = useQuery({
    ...trpc.chapter.removalImpact.queryOptions({ chapterId: pending?.id ?? '' }),
    enabled: pending?.kind === 'chapter',
  })
  const sectionImpact = useQuery({
    ...trpc.section.removalImpact.queryOptions({ sectionId: pending?.id ?? '' }),
    enabled: pending?.kind === 'section' || pending?.kind === 'join',
  })
  const impact = pending?.kind === 'chapter' ? chapterImpact.data : sectionImpact.data
  const impactLoading =
    pending?.kind === 'chapter'
      ? chapterImpact.isLoading
      : pending
        ? sectionImpact.isLoading
        : false
  const confirmLabel =
    pending?.kind === 'join'
      ? 'Join them'
      : pending?.kind === 'chapter'
        ? chapterImpact.data
          ? `Remove the chapter and ${String(chapterImpact.data.sections)} ${chapterImpact.data.sections === 1 ? 'section' : 'sections'}`
          : 'Remove the chapter'
        : 'Remove the section'

  // Every action's failure, not most of them: renaming a chapter and adding a
  // section used to fail without a word (phase 12 audit).
  const error =
    reorderChapters.error ??
    reorderSections.error ??
    createChapter.error ??
    renameChapter.error ??
    deleteChapter.error ??
    createSection.error ??
    renameSection.error ??
    deleteSection.error ??
    joinSection.error ??
    moveSection.error

  function onChapterDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = chapters.findIndex((chapter) => chapter.id === active.id)
    const to = chapters.findIndex((chapter) => chapter.id === over.id)
    // Move locally first so the list does not jump back while the write runs.
    const next = arrayMove(chapters, from, to)
    setChapters(next)
    reorderChapters.mutate({ versionId, chapterIds: next.map((chapter) => chapter.id) })
  }

  function onSectionDragEnd(chapterId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const chapter = chapters.find((entry) => entry.id === chapterId)
    if (!chapter) return
    const from = chapter.sections.findIndex((section) => section.id === active.id)
    const to = chapter.sections.findIndex((section) => section.id === over.id)
    const sections = arrayMove(chapter.sections, from, to)
    setChapters((current) =>
      current.map((entry) => (entry.id === chapterId ? { ...entry, sections } : entry)),
    )
    reorderSections.mutate({ chapterId, sectionIds: sections.map((section) => section.id) })
  }

  return (
    <div className="mt-8">
      {/* Item 5.2 (FR-2.4) — removing and joining ask first, and say what follows. */}
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'join'
            ? `Join “${pending.name}” into the one above?`
            : `Remove “${pending?.name ?? ''}”?`
        }
        confirmLabel={confirmLabel}
        destructive={pending?.kind !== 'join'}
        busy={
          deleteChapter.isPending ||
          deleteSection.isPending ||
          joinSection.isPending ||
          impactLoading
        }
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return
          if (pending.kind === 'chapter') deleteChapter.mutate({ chapterId: pending.id })
          else if (pending.kind === 'section') deleteSection.mutate({ sectionId: pending.id })
          else joinSection.mutate({ sectionId: pending.id })
        }}
      >
        <Consequences kind={pending?.kind ?? 'section'} impact={impact} />
      </ConfirmDialog>
      {error ? (
        <p role="alert" className="mb-4 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onChapterDragEnd}
      >
        <SortableContext
          items={chapters.map((chapter) => chapter.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-6">
            {chapters.map((chapter, chapterIndex) => (
              <SortableRow
                key={chapter.id}
                id={chapter.id}
                label={`Move chapter ‘${chapter.title}’`}
              >
                {(handle) => (
                  <div className="border border-rule bg-paper">
                    <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
                      {handle}
                      <Input
                        aria-label={`Chapter ${chapterIndex + 1} name`}
                        defaultValue={chapter.title}
                        className="h-8 border-transparent font-manuscript text-[17px] hover:border-rule"
                        onBlur={(event) => {
                          const title = event.target.value.trim()
                          if (title && title !== chapter.title) {
                            renameChapter.mutate({ chapterId: chapter.id, title })
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={chapters.length <= 1 || deleteChapter.isPending}
                        title={
                          chapters.length <= 1 ? 'A story keeps at least one chapter.' : undefined
                        }
                        onClick={() =>
                          setPending({ kind: 'chapter', id: chapter.id, name: chapter.title })
                        }
                      >
                        Remove
                      </Button>
                    </div>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                      onDragEnd={(event) => onSectionDragEnd(chapter.id, event)}
                    >
                      <SortableContext
                        items={chapter.sections.map((section) => section.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="divide-y divide-rule">
                          {chapter.sections.map((section, sectionIndex) => (
                            <SortableRow
                              key={section.id}
                              id={section.id}
                              label={`Move section ‘${section.title ?? `Section ${String(sectionIndex + 1)}`}’`}
                            >
                              {(sectionHandle) => (
                                <>
                                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                                    {sectionHandle}
                                    {/* FR-2.3 — sections are named here, as
                                      chapters are. `section.rename` had no
                                      caller until the 2026-10-16 spec review. */}
                                    <Input
                                      aria-label={`Chapter ${chapterIndex + 1}, section ${sectionIndex + 1} name`}
                                      defaultValue={section.title ?? ''}
                                      placeholder={`Section ${sectionIndex + 1}`}
                                      className="h-8 min-w-0 flex-1 border-transparent text-[13.5px] hover:border-rule"
                                      onBlur={(event) => {
                                        const title = event.target.value.trim()
                                        if (title !== (section.title ?? '')) {
                                          renameSection.mutate({ sectionId: section.id, title })
                                        }
                                      }}
                                    />
                                    <Link
                                      href={`/s/${slug}/c/${chapterIndex + 1}/${sectionIndex + 1}/edit${versionQuery}`}
                                      className="shrink-0 text-[12.5px] text-pencil hover:underline"
                                    >
                                      Write
                                    </Link>
                                    <span className="shrink-0 text-[12px] text-ink-faint tabular-nums">
                                      {section.wordCount.toLocaleString('en-GB')}
                                    </span>
                                    {/* FR-2.4 — never called "merge" in the interface. */}
                                    {sectionIndex > 0 ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={joinSection.isPending}
                                        onClick={() =>
                                          setPending({
                                            kind: 'join',
                                            id: section.id,
                                            name:
                                              section.title ??
                                              `Section ${String(sectionIndex + 1)}`,
                                          })
                                        }
                                      >
                                        Join with the one above
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={
                                        chapter.sections.length <= 1 || deleteSection.isPending
                                      }
                                      onClick={() =>
                                        setPending({
                                          kind: 'section',
                                          id: section.id,
                                          name:
                                            section.title ?? `Section ${String(sectionIndex + 1)}`,
                                        })
                                      }
                                    >
                                      Remove
                                    </Button>
                                    {/* Item 8.3 — the keyboard's way, and the only way across chapters. */}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-expanded={moving?.sectionId === section.id}
                                      onClick={() =>
                                        setMoving(
                                          moving?.sectionId === section.id
                                            ? null
                                            : {
                                                sectionId: section.id,
                                                toChapterId: chapter.id,
                                                position: sectionIndex,
                                              },
                                        )
                                      }
                                    >
                                      Move to…
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={createSection.isPending}
                                      onClick={() =>
                                        createSection.mutate({
                                          chapterId: chapter.id,
                                          afterSectionId: section.id,
                                        })
                                      }
                                    >
                                      Add one after
                                    </Button>
                                  </div>
                                  {moving?.sectionId === section.id ? (
                                    <MoveForm
                                      chapters={chapters}
                                      moving={moving}
                                      fromChapterId={chapter.id}
                                      busy={moveSection.isPending}
                                      onChange={setMoving}
                                      onCancel={() => setMoving(null)}
                                      onMove={() => moveSection.mutate(moving)}
                                    />
                                  ) : null}
                                </>
                              )}
                            </SortableRow>
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>

                    <div className="border-t border-rule px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={createSection.isPending}
                        onClick={() => createSection.mutate({ chapterId: chapter.id })}
                      >
                        Add a section
                      </Button>
                    </div>
                  </div>
                )}
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        className="mt-8 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const title = newChapterTitle.trim()
          if (title) createChapter.mutate({ versionId, title })
        }}
      >
        <Input
          aria-label="New chapter name"
          placeholder="Chapter five"
          maxLength={TITLE_MAX_CHARS}
          value={newChapterTitle}
          onChange={(event) => setNewChapterTitle(event.target.value)}
        />
        <Button type="submit" disabled={!newChapterTitle.trim() || createChapter.isPending}>
          Add a chapter
        </Button>
      </form>
    </div>
  )
}

/**
 * Item 8.3 (FR-2.3) — where to move a section: a chapter, and a place in it.
 * The places are counted as the reader counts them, from 1; "at the end" is
 * one past the last.
 */
function MoveForm({
  chapters,
  moving,
  fromChapterId,
  busy,
  onChange,
  onCancel,
  onMove,
}: {
  chapters: ReadonlyArray<{ id: string; title: string; sections: ReadonlyArray<{ id: string }> }>
  moving: { sectionId: string; toChapterId: string; position: number }
  fromChapterId: string
  busy: boolean
  onChange: (next: { sectionId: string; toChapterId: string; position: number }) => void
  onCancel: () => void
  onMove: () => void
}) {
  const id = useId()
  const target = chapters.find((chapter) => chapter.id === moving.toChapterId)
  // In its own chapter the section is not one of the places it can go to.
  const others = (target?.sections ?? []).filter((section) => section.id !== moving.sectionId)
  const places = others.length + 1
  return (
    <form
      className="flex flex-wrap items-end gap-3 border-t border-rule/70 bg-paper-sunk px-3 py-2.5 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault()
        onMove()
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-chapter`} className="text-[12px] text-ink-faint">
          Chapter
        </label>
        <select
          id={`${id}-chapter`}
          className="h-8 rounded-control border border-rule bg-paper px-2"
          value={moving.toChapterId}
          onChange={(event) => {
            const next = chapters.find((chapter) => chapter.id === event.target.value)
            const count = (next?.sections ?? []).filter(
              (section) => section.id !== moving.sectionId,
            ).length
            onChange({ ...moving, toChapterId: event.target.value, position: count })
          }}
        >
          {chapters.map((chapter, index) => (
            <option key={chapter.id} value={chapter.id}>
              {index + 1}. {chapter.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-place`} className="text-[12px] text-ink-faint">
          Place
        </label>
        <select
          id={`${id}-place`}
          className="h-8 rounded-control border border-rule bg-paper px-2"
          value={Math.min(moving.position, places - 1)}
          onChange={(event) => onChange({ ...moving, position: Number(event.target.value) })}
        >
          {Array.from({ length: places }, (_, index) => (
            <option key={index} value={index}>
              {index === places - 1 ? `${String(index + 1)} — at the end` : String(index + 1)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="primary" disabled={busy}>
        {busy
          ? 'Moving…'
          : moving.toChapterId === fromChapterId
            ? 'Move it there'
            : 'Move it to that chapter'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

/** One draggable row, with a handle that is reachable from the keyboard (NFR-4). */
/** The dialog's plain words about what a removal or a join does (item 5.2). */
function Consequences({
  kind,
  impact,
}: {
  kind: 'chapter' | 'section' | 'join'
  impact: { sections?: number; words: number; openRequests: number; told: Person[] } | undefined
}) {
  if (!impact) return <p>Working out what this would do…</p>
  const words = `${impact.words.toLocaleString('en-GB')} ${impact.words === 1 ? 'word' : 'words'}`
  const sections = impact.sections ?? 0
  return (
    <>
      <p>
        {kind === 'chapter'
          ? `Its ${String(sections)} ${sections === 1 ? 'section' : 'sections'} and ${words} leave the story.`
          : kind === 'section'
            ? `Its ${words} leave the story.`
            : `Its ${words} move into the section above, as the end of it.`}
      </p>
      <p>{requestsSentence(impact)}</p>
      {kind === 'join' ? null : (
        <p>
          You can bring it back from Removed, below, within {SOFT_DELETE_GRACE_DAYS} days. Requests
          closed by this stay closed.
        </p>
      )}
    </>
  )
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string
  /** Item 8.11 — what the handle moves: "Move section ‘Vessel’". */
  label: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const handle = (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="shrink-0 cursor-grab px-1 text-ink-faint hover:text-ink active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span aria-hidden>⠿</span>
    </button>
  )

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-90 shadow-lift' : undefined}
    >
      {children(handle)}
    </li>
  )
}
