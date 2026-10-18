'use client'

import { useMutation } from '@tanstack/react-query'

import { useTRPC } from '@/trpc/client'

/**
 * FR-4.5 — a draft overtaken by someone else's save, kept beside the text to
 * copy from, can be thrown away once it has been. `section.discardDraft` had
 * no caller until the 2026-10-16 spec review, so such a draft stayed for good
 * and the warning came back every time the section was opened.
 *
 * Safe here because the editor is not holding this draft: it opened on the
 * current text. Discarding the draft the editor is holding is the editor's
 * own button (`SectionEditor`), which has its saves to stand down first.
 */
export function DiscardDraftButton({ sectionId }: { sectionId: string }) {
  const trpc = useTRPC()
  const discard = useMutation(
    trpc.section.discardDraft.mutationOptions({ onSuccess: () => window.location.reload() }),
  )

  return (
    <>
      <button
        type="button"
        className="mt-2 text-[12.5px] text-pencil underline-offset-2 hover:underline disabled:text-ink-faint"
        disabled={discard.isPending}
        onClick={() => discard.mutate({ sectionId })}
      >
        {discard.isPending ? 'Throwing it away' : 'I have what I need from it: throw it away'}
      </button>
      {discard.isError ? (
        <p role="alert" className="mt-1 text-[12.5px] text-crimson">
          {discard.error.message}
        </p>
      ) : null}
    </>
  )
}
