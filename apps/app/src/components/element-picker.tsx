'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'

import type { ScreenplayBlockType } from '@/lib/doc/schema'
import { ELEMENT_CYCLE } from '@/lib/doc/tiptap'

/** FR-4.2's elements, as a screenwriter names them. */
export const ELEMENT_LABELS: Record<ScreenplayBlockType, string> = {
  scene_heading: 'Scene heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
}

/**
 * FR-4.2, decision 0040 — which element the line under the cursor is, and a
 * way to change it. Beside the keys (Tab, Shift-Tab, Enter) for anyone who
 * would rather choose than cycle, and so the element is always on screen.
 */
export function ElementPicker({ editor }: { editor: Editor }) {
  const element = useEditorState({
    editor,
    selector: ({ editor: current }) => current.state.selection.$from.parent.type.name,
  })

  return (
    <label
      className="flex items-center gap-1.5 text-[12.5px] text-ink-soft"
      title="Tab and Shift-Tab change the element; Escape leaves the editor"
    >
      Element
      <select
        aria-label="Element"
        value={element}
        onChange={(event) => editor.chain().focus().setNode(event.target.value).run()}
        className="h-8 rounded-control border border-rule bg-paper px-2 text-[13px] text-ink"
      >
        {ELEMENT_CYCLE.map((name) => (
          <option key={name} value={name}>
            {ELEMENT_LABELS[name]}
          </option>
        ))}
        {/* A plain paragraph is storable in a script (schema.ts), and an
            imported one shows as itself rather than as a wrong element. */}
        {(ELEMENT_CYCLE as readonly string[]).includes(element) ? null : (
          <option value={element} disabled>
            Plain text
          </option>
        )}
      </select>
    </label>
  )
}
