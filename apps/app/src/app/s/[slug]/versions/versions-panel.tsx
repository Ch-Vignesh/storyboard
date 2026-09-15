'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { nameOf } from '@/lib/people'
import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type Version = inferRouterOutputs<AppRouter>['version']['list']['versions'][number]

const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const

/**
 * FR-10.1 and FR-10.2 — versions of one storyboard.
 *
 * Promotion is the delicate one. It swaps which draft is the main one and keeps
 * the old main as an alternate (FR-10.2), so nothing is lost, and the interface
 * has to say that clearly enough that nobody hesitates over the button.
 */
export function VersionsPanel({
  slug,
  storyboardId,
  initialVersions,
  canEdit,
}: {
  slug: string
  storyboardId: string
  initialVersions: Version[]
  canEdit: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listOptions = trpc.version.list.queryOptions({ storyboardId })
  const { data } = useQuery(listOptions)

  // The server already rendered a list; the query replaces it once it lands.
  const versions: Version[] = data?.versions ?? initialVersions
  const refresh = () => queryClient.invalidateQueries({ queryKey: listOptions.queryKey })

  const [creatingFrom, setCreatingFrom] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirmPromote, setConfirmPromote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const create = useMutation(
    trpc.version.create.mutationOptions({
      onSuccess: async () => {
        setCreatingFrom(null)
        setNewName('')
        await refresh()
      },
    }),
  )
  const rename = useMutation(
    trpc.version.rename.mutationOptions({
      onSuccess: async () => {
        setRenaming(null)
        await refresh()
      },
    }),
  )
  const promote = useMutation(
    trpc.version.promoteToMain.mutationOptions({
      onSuccess: async () => {
        setConfirmPromote(null)
        await refresh()
      },
    }),
  )
  const remove = useMutation(
    trpc.version.delete.mutationOptions({
      onSuccess: async () => {
        setConfirmDelete(null)
        await refresh()
      },
    }),
  )

  const error =
    create.error?.message ??
    rename.error?.message ??
    promote.error?.message ??
    remove.error?.message ??
    null

  const main = versions.find((version) => version.isMain)

  return (
    <div className="mt-8">
      {error ? (
        <p role="alert" className="mb-4 text-[13px] text-crimson">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-rule border-y border-rule">
        {versions.map((version) => (
          <li key={version.id} className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                {renaming === version.id ? (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const name = renameTo.trim()
                      if (name.length > 0 && !rename.isPending) {
                        rename.mutate({ versionId: version.id, name })
                      }
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`rename-${version.id}`}>Name</Label>
                      <Input
                        id={`rename-${version.id}`}
                        autoFocus
                        maxLength={120}
                        value={renameTo}
                        onChange={(event) => setRenameTo(event.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <p className="text-[15px] text-ink">
                      <Link
                        href={
                          version.isMain
                            ? `/s/${slug}`
                            : `/s/${slug}?version=${encodeURIComponent(version.id)}`
                        }
                        className="text-pencil hover:underline"
                      >
                        {version.name}
                      </Link>
                      {version.isMain ? (
                        <span className="ml-2 border border-moss/40 bg-moss-wash px-1.5 py-0.5 text-[11px] tracking-wide text-moss uppercase">
                          Main draft
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-faint">
                      {version.chapters} {version.chapters === 1 ? 'chapter' : 'chapters'}
                      {' · '}
                      <span className="tabular-nums">
                        {version.wordCount.toLocaleString('en-GB')} words
                      </span>
                      {' · started by '}
                      {nameOf(version.createdBy)} on{' '}
                      {version.createdAt.toLocaleDateString('en-GB', DATE)}
                    </p>
                  </>
                )}
              </div>

              {canEdit && renaming !== version.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  {!version.isMain ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmPromote(version.id)}
                      disabled={promote.isPending}
                    >
                      Make main draft
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenaming(version.id)
                      setRenameTo(version.name)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreatingFrom(version.id)
                      setNewName('')
                    }}
                  >
                    Start another from this
                  </Button>
                  {!version.isMain ? (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(version.id)}>
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* FR-10.2 — promotion keeps the old main. Say so before, not after. */}
            {confirmPromote === version.id ? (
              <div className="mt-3 border-l-2 border-pencil bg-pencil-wash/40 py-2 pl-4">
                <p className="text-[13.5px] leading-relaxed text-ink">
                  Make {version.name} the main draft? {main ? main.name : 'The current main draft'}{' '}
                  stays here as an alternate — nothing is lost, and you can swap back.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={promote.isPending}
                    onClick={() => promote.mutate({ versionId: version.id })}
                  >
                    {promote.isPending ? 'Swapping…' : 'Make it the main draft'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmPromote(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {confirmDelete === version.id ? (
              <div className="mt-3 border-l-2 border-crimson bg-paper-sunk py-2 pl-4">
                <p className="text-[13.5px] leading-relaxed text-ink">
                  Delete {version.name}? The writing in it stays in everyone&rsquo;s history and
                  credits, but this draft will no longer be listed.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ versionId: version.id })}
                  >
                    {remove.isPending ? 'Deleting…' : 'Delete this version'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}

            {creatingFrom === version.id ? (
              <form
                className="mt-3 flex items-end gap-2 border-l-2 border-rule pl-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = newName.trim()
                  if (name.length > 0 && !create.isPending) {
                    create.mutate({ baseVersionId: version.id, name })
                  }
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`new-from-${version.id}`}>
                    A name for the new version, copied from {version.name}
                  </Label>
                  <Input
                    id={`new-from-${version.id}`}
                    autoFocus
                    required
                    maxLength={120}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Chapter 4, the other way"
                  />
                </div>
                <Button type="submit" size="sm" variant="primary" disabled={create.isPending}>
                  {create.isPending ? 'Copying…' : 'Start it'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCreatingFrom(null)}
                >
                  Cancel
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {/* FR-7.5 — two versions side by side, once there are two. */}
      {versions.length > 1 ? (
        <p className="mt-6 text-[13px] text-ink-faint">
          <Link href={`/s/${slug}/compare`} className="text-pencil hover:underline">
            Compare two versions
          </Link>{' '}
          to see what changed between them.
        </p>
      ) : null}
    </div>
  )
}
