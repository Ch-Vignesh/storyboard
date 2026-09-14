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
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  chapters: initialChapters,
}: {
  slug: string
  versionId: string
  chapters: Chapter[]
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [chapters, setChapters] = useState(initialChapters)
  const [newChapterTitle, setNewChapterTitle] = useState('')

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
  const deleteChapter = useMutation(trpc.chapter.delete.mutationOptions({ onSuccess: refresh }))
  const createSection = useMutation(trpc.section.create.mutationOptions({ onSuccess: refresh }))
  const deleteSection = useMutation(trpc.section.delete.mutationOptions({ onSuccess: refresh }))
  const joinSection = useMutation(
    trpc.section.joinWithPrevious.mutationOptions({ onSuccess: refresh }),
  )

  const error =
    reorderChapters.error ??
    reorderSections.error ??
    createChapter.error ??
    deleteChapter.error ??
    deleteSection.error ??
    joinSection.error

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
              <SortableRow key={chapter.id} id={chapter.id}>
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
                          chapters.length <= 1
                            ? 'A storyboard keeps at least one chapter.'
                            : undefined
                        }
                        onClick={() => deleteChapter.mutate({ chapterId: chapter.id })}
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
                            <SortableRow key={section.id} id={section.id}>
                              {(sectionHandle) => (
                                <div className="flex items-center gap-2 px-3 py-2">
                                  {sectionHandle}
                                  <Link
                                    href={`/s/${slug}/c/${chapterIndex + 1}/${sectionIndex + 1}/edit`}
                                    className="min-w-0 flex-1 truncate text-[13.5px] text-ink hover:text-pencil hover:underline"
                                  >
                                    {section.title ?? `Section ${sectionIndex + 1}`}
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
                                      onClick={() => joinSection.mutate({ sectionId: section.id })}
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
                                    onClick={() => deleteSection.mutate({ sectionId: section.id })}
                                  >
                                    Remove
                                  </Button>
                                </div>
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
          maxLength={200}
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

/** One draggable row, with a handle that is reachable from the keyboard (NFR-4). */
function SortableRow({
  id,
  children,
}: {
  id: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const handle = (
    <button
      type="button"
      aria-label="Reorder"
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
