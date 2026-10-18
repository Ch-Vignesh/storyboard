'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { UserAvatar } from '@/components/user-avatar'
import type { Person } from '@/lib/people'
import { AVATAR } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

const MEGABYTES = String(AVATAR.maxUploadBytes / (1024 * 1024))

/**
 * Phase 14, item 3.13 (D-5) — the picture, in settings. The file goes to
 * `/api/avatar`, which shrinks it to the icon; removing goes through
 * `settings.removeAvatar`. Either way the header is refreshed, because it is
 * the one place the picture is on every page.
 */
export function ProfilePicture({ person }: { person: Person }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const inputId = useId()
  const [note, setNote] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const refresh = async () => {
    await queryClient.invalidateQueries(trpc.settings.get.queryFilter())
    router.refresh()
  }

  const remove = useMutation(
    trpc.settings.removeAvatar.mutationOptions({
      onSuccess: async () => {
        setNote('Your picture has been removed.')
        await refresh()
      },
      onError: (error) => setNote(error.message),
    }),
  )

  async function upload(file: File) {
    if (file.size > AVATAR.maxUploadBytes) {
      setNote(`That file is too big. Choose a picture under ${MEGABYTES} MB.`)
      return
    }
    setUploading(true)
    setNote(null)
    try {
      const body = new FormData()
      body.set('picture', file)
      const response = await fetch('/api/avatar', { method: 'POST', body })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setNote(result.error ?? 'That did not work. Try again in a moment.')
        return
      }
      setNote('Your picture is set.')
      await refresh()
    } catch {
      setNote('That did not work. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-5 flex items-center gap-4">
      <UserAvatar person={person} size="xl" />
      <div className="min-w-0 space-y-1.5 text-[13.5px]">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <label
            htmlFor={inputId}
            className={uploading ? 'text-ink-faint' : 'cursor-pointer text-pencil hover:underline'}
          >
            {uploading ? 'Uploading' : 'Change picture'}
          </label>
          <input
            id={inputId}
            type="file"
            accept={AVATAR.types.join(',')}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Let the same file be chosen again after a refusal.
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
          {person?.avatar ? (
            <button
              type="button"
              className="text-ink-soft hover:text-ink hover:underline disabled:text-ink-faint"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove picture
            </button>
          ) : null}
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-faint">
          A JPEG, PNG or WebP up to {MEGABYTES} MB. It is cut square and shrunk to a small icon;
          nothing larger is kept.
        </p>
        {note ? (
          <p role="status" className="text-[13px] text-ink-soft">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  )
}
