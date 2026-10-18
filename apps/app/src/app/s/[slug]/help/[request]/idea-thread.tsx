'use client'

import { Button } from '@storyboard/ui/components/button'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import Link from '@/components/link'
import { IDEA_REPLY_WORDS, IDEA_WORDS } from '@/lib/schemas/constants'
import { formatInZone } from '@/lib/time-zone'
import {
  BLOCKED_FROM_HELPING,
  countWords,
  ideaTakenNow,
  type REQUEST_STATE_LABELS,
} from '@/lib/schemas/help'
import { ReportButton } from '@/components/report-button'
import { UserAvatar } from '@/components/user-avatar'
import { useTRPC } from '@/trpc/client'

type Idea = {
  id: string
  body: string
  parentId: string | null
  markedHelpful: boolean
  /** Item 2.7 — hidden after a report; `redacted` when this reader sees the placeholder. */
  hidden: boolean
  redacted: boolean
  createdAt: Date
  /** Item 6.8 — changed, or removed, by its writer. */
  editedAt: Date | null
  deletedAt: Date | null
  /** Whether this reader may still change it: the server judges the window. */
  canChange: boolean
  author: { id: string; username: string | null; displayName: string | null }
}

/**
 * FR-6.9 — ideas for an `unblock` request. Threaded one level deep so the
 * author can reply, never merged, and one may be marked as having helped
 * (OD-5, decision 0010).
 */
export function IdeaThread({
  requestId,
  ideas,
  canDecide,
  canPost,
  signedIn,
  blockedFromHelping = false,
  hasHelpfulIdea,
  viewerId,
  requestState,
  authorIds,
  slug,
  requestPublicId,
  timeZone,
}: {
  requestId: string
  ideas: Idea[]
  canDecide: boolean
  canPost: boolean
  signedIn: boolean
  /** Decision 0046 (item 2.9) — an author blocked this person: the sentence, not the form. */
  blockedFromHelping?: boolean
  hasHelpfulIdea: boolean
  /** Whose ideas not to offer a report control on. Null for a guest. */
  viewerId: string | null
  /** FR-5.9 — decides whether a new idea, or a reply, would be taken now (item 1.8). */
  requestState: keyof typeof REQUEST_STATE_LABELS
  /** The story's authors: their own ideas cannot be the one that helped (item 1.7). */
  authorIds: readonly string[]
  /** Item 6.8 — for the guest's way in, and for the dates (item 1.18). */
  slug: string
  requestPublicId: string
  timeZone: string
}) {
  // Shown only where the server would accept it, with the same reason it
  // would give; the server used to refuse an idea only after it was written.
  const openings = ideaTakenNow(requestState, false)
  const replies = ideaTakenNow(requestState, true)
  const trpc = useTRPC()
  const router = useRouter()
  const refresh = () => router.refresh()

  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const post = useMutation(
    trpc.idea.post.mutationOptions({
      onSuccess: () => {
        setBody('')
        setReplyBody('')
        setReplyTo(null)
        refresh()
      },
    }),
  )
  const markHelpful = useMutation(trpc.idea.markHelpful.mutationOptions({ onSuccess: refresh }))

  // Item 6.8 — your own idea, changed for a while, or removed (after asking).
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [removing, setRemoving] = useState<Idea | null>(null)
  const edit = useMutation(
    trpc.idea.edit.mutationOptions({
      onSuccess: () => {
        setEditing(null)
        refresh()
      },
    }),
  )
  const remove = useMutation(
    trpc.idea.remove.mutationOptions({
      onSuccess: () => {
        setRemoving(null)
        refresh()
      },
    }),
  )
  const mine = (idea: Idea) => viewerId !== null && idea.author.id === viewerId
  const canChange = (idea: Idea) => idea.canChange
  const canRemove = (idea: Idea) => mine(idea) && !idea.markedHelpful && !idea.deletedAt
  const when = (idea: Idea) => (
    <>
      {' · '}
      <time dateTime={idea.createdAt.toISOString()}>
        {formatInZone(idea.createdAt, 'dateTime', timeZone)}
      </time>
      {idea.editedAt ? ' · edited' : ''}
    </>
  )
  const bounds = (parent: boolean) => (parent ? IDEA_REPLY_WORDS : IDEA_WORDS)
  /** Why Send is off, for a counter under a box. */
  const shortfall = (count: number, range: { min: number; max: number }) =>
    count < range.min
      ? ` · ${String(range.min - count)} more before you can send it`
      : count > range.max
        ? ` · ${String(count - range.max)} over`
        : ''
  const editForm = (idea: Idea) => {
    const range = bounds(idea.parentId !== null)
    const count = countWords(editBody)
    const ok = count >= range.min && count <= range.max
    return (
      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (ok) edit.mutate({ ideaId: idea.id, body: editBody.trim() })
        }}
      >
        <Textarea
          rows={4}
          aria-label="Your idea, changed"
          value={editBody}
          onChange={(event) => setEditBody(event.target.value)}
        />
        <p
          role="status"
          className={ok ? 'text-[12.5px] text-ink-faint' : 'text-[12.5px] text-ochre'}
        >
          <span className="tabular-nums">{count}</span> words ({range.min} to {range.max})
          {shortfall(count, range)}
        </p>
        {edit.isError ? (
          <p role="alert" className="text-[13px] text-crimson">
            {edit.error.message}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="primary" disabled={!ok || edit.isPending}>
            Save the change
          </Button>
          <button
            type="button"
            className="text-[12.5px] text-ink-soft hover:text-ink"
            onClick={() => setEditing(null)}
          >
            Leave it
          </button>
        </div>
      </form>
    )
  }
  const controls = (idea: Idea) => (
    <>
      {canChange(idea) && editing !== idea.id ? (
        <button
          type="button"
          className="text-[12.5px] text-pencil hover:underline"
          onClick={() => {
            setEditBody(idea.body)
            setEditing(idea.id)
          }}
        >
          Change
        </button>
      ) : null}
      {canRemove(idea) ? (
        <button
          type="button"
          className="text-[12.5px] text-ink-soft hover:text-ink hover:underline"
          onClick={() => setRemoving(idea)}
        >
          Remove
        </button>
      ) : null}
    </>
  )

  const roots = ideas.filter((idea) => idea.parentId === null)
  const repliesOf = (id: string) => ideas.filter((idea) => idea.parentId === id)

  const words = countWords(body)
  const canSend = words >= IDEA_WORDS.min && words <= IDEA_WORDS.max && !post.isPending

  return (
    <section className="mt-10">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Ideas ({roots.length})
      </h2>

      {roots.length === 0 ? (
        <p className="mt-4 border border-rule bg-paper-sunk px-5 py-8 text-center text-[14px] text-ink-soft">
          Nothing yet. That is a normal state, not a failure.
        </p>
      ) : (
        <ul className="mt-4 space-y-5">
          {roots.map((idea) => (
            <li
              key={idea.id}
              // Where "someone replied to your idea" leads (item 1.9).
              id={`idea-${idea.id}`}
              className={
                idea.markedHelpful
                  ? 'border-l-2 border-moss bg-moss-wash/40 py-3 pl-4'
                  : 'border-l-2 border-rule py-3 pl-4'
              }
            >
              <p className="text-[13px] text-ink-faint">
                <UserAvatar person={idea.author} size="sm" className="mr-1.5 align-middle" />
                {idea.author.displayName ?? idea.author.username ?? 'someone'}
                {when(idea)}
                {idea.markedHelpful ? (
                  <span className="ml-2 border border-moss/40 bg-moss-wash px-1.5 py-0.5 text-[11px] text-moss">
                    this helped
                  </span>
                ) : null}
              </p>
              {editing === idea.id ? (
                editForm(idea)
              ) : idea.deletedAt ? (
                <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-faint italic">
                  Removed by its writer.
                </p>
              ) : (
                <p
                  className={
                    idea.redacted
                      ? 'mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-faint italic'
                      : 'mt-2 max-w-measure text-[14.5px] leading-relaxed whitespace-pre-line text-ink'
                  }
                >
                  {idea.body}
                </p>
              )}
              {idea.hidden && !idea.redacted ? (
                <p className="mt-1 text-[12.5px] text-crimson">
                  Hidden after a report: it reads as removed to everyone but its writer and the
                  moderators.
                </p>
              ) : null}

              <div className="mt-2 flex items-center gap-3">
                {/* OD-5 / decision 0010 — one per request. */}
                {canDecide &&
                !idea.hidden &&
                !idea.markedHelpful &&
                !hasHelpfulIdea &&
                !authorIds.includes(idea.author.id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={markHelpful.isPending}
                    onClick={() => markHelpful.mutate({ ideaId: idea.id })}
                  >
                    This one helped
                  </Button>
                ) : null}
                {canPost && replies.ok ? (
                  <button
                    type="button"
                    className="text-[12.5px] text-pencil hover:underline"
                    onClick={() => setReplyTo(replyTo === idea.id ? null : idea.id)}
                  >
                    Reply
                  </button>
                ) : null}
                {controls(idea)}
                {/* FR-13.5 — last in the row, and only on somebody else's. */}
                {canPost && idea.author.id !== viewerId ? (
                  <ReportButton targetType="IDEA" targetId={idea.id} />
                ) : null}
              </div>

              {repliesOf(idea.id).length > 0 ? (
                <ul className="mt-3 space-y-3 border-l border-rule pl-4">
                  {repliesOf(idea.id).map((reply) => (
                    <li key={reply.id}>
                      <p className="text-[12.5px] text-ink-faint">
                        {reply.author.displayName ?? reply.author.username ?? 'someone'}
                        {when(reply)}
                      </p>
                      {editing === reply.id ? (
                        editForm(reply)
                      ) : reply.deletedAt ? (
                        <p className="mt-1 max-w-measure text-[14px] leading-relaxed text-ink-faint italic">
                          Removed by its writer.
                        </p>
                      ) : (
                        <p className="mt-1 max-w-measure text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
                          {reply.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3">{controls(reply)}</div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {replyTo === idea.id ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    post.mutate({ requestId, body: replyBody.trim(), parentId: idea.id })
                  }}
                >
                  <Textarea
                    rows={3}
                    aria-label="Your reply"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  {/* Item 6.8 (D-7) — a reply is one word up; the counter says why Send waits. */}
                  <p
                    role="status"
                    className={
                      countWords(replyBody) > IDEA_REPLY_WORDS.max
                        ? 'text-[12.5px] text-ochre'
                        : 'text-[12.5px] text-ink-faint'
                    }
                  >
                    <span className="tabular-nums">{countWords(replyBody)}</span> words (
                    {IDEA_REPLY_WORDS.min} to {IDEA_REPLY_WORDS.max})
                    {shortfall(countWords(replyBody), IDEA_REPLY_WORDS)}
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={
                      countWords(replyBody) < IDEA_REPLY_WORDS.min ||
                      countWords(replyBody) > IDEA_REPLY_WORDS.max ||
                      post.isPending
                    }
                  >
                    Send the reply
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canPost && openings.ok ? (
        <form
          className="mt-8 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSend) post.mutate({ requestId, body: body.trim() })
          }}
        >
          <label htmlFor="idea" className="text-[13.5px] font-medium text-ink">
            Add an idea
          </label>
          <Textarea
            id="idea"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Options, a diagnosis, a direction. Not prose — this never goes into the draft."
          />
          <p
            role="status"
            className={
              words > 0 && (words < IDEA_WORDS.min || words > IDEA_WORDS.max)
                ? 'text-[12.5px] text-ochre'
                : 'text-[12.5px] text-ink-faint'
            }
          >
            <span className="tabular-nums">{words}</span> words ({IDEA_WORDS.min} to{' '}
            {IDEA_WORDS.max}){words > 0 ? shortfall(words, IDEA_WORDS) : ''}
          </p>
          {post.isError ? (
            <p role="alert" className="text-[13px] text-crimson">
              {post.error.message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={!canSend}>
            Send this idea
          </Button>
        </form>
      ) : canPost && !openings.ok ? (
        <p className="mt-6 text-[13.5px] text-ink-soft">{openings.reason}</p>
      ) : blockedFromHelping ? (
        <p className="mt-6 text-[13.5px] text-ink-soft">{BLOCKED_FROM_HELPING}</p>
      ) : !signedIn ? (
        <p className="mt-6 text-[13.5px] text-ink-soft">
          <Link
            href={`/signin?next=/s/${slug}/help/${requestPublicId}`}
            className="text-pencil hover:underline"
          >
            Sign in
          </Link>{' '}
          to add an idea.
        </p>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this idea?"
        confirmLabel="Remove it"
        destructive
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate({ ideaId: removing.id })
        }}
      >
        <p>
          It will read as removed by its writer. Replies to it stay, because they are other
          people&rsquo;s.
        </p>
      </ConfirmDialog>
      {remove.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {remove.error.message}
        </p>
      ) : null}

      {markHelpful.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {markHelpful.error.message}
        </p>
      ) : null}
    </section>
  )
}
