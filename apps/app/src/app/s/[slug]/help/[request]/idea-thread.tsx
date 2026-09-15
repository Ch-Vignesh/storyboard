'use client'

import { Button } from '@storyboard/ui/components/button'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IDEA_WORDS } from '@/lib/schemas/constants'
import { countWords } from '@/lib/schemas/help'
import { ReportButton } from '@/components/report-button'
import { useTRPC } from '@/trpc/client'

type Idea = {
  id: string
  body: string
  parentId: string | null
  markedHelpful: boolean
  createdAt: Date
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
  hasHelpfulIdea,
  viewerId,
}: {
  requestId: string
  ideas: Idea[]
  canDecide: boolean
  canPost: boolean
  signedIn: boolean
  hasHelpfulIdea: boolean
  /** Whose ideas not to offer a report control on. Null for a guest. */
  viewerId: string | null
}) {
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
              className={
                idea.markedHelpful
                  ? 'border-l-2 border-moss bg-moss-wash/40 py-3 pl-4'
                  : 'border-l-2 border-rule py-3 pl-4'
              }
            >
              <p className="text-[13px] text-ink-faint">
                {idea.author.displayName ?? idea.author.username ?? 'someone'}
                {idea.markedHelpful ? (
                  <span className="ml-2 border border-moss/40 bg-moss-wash px-1.5 py-0.5 text-[11px] text-moss">
                    this helped
                  </span>
                ) : null}
              </p>
              <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed whitespace-pre-line text-ink">
                {idea.body}
              </p>

              <div className="mt-2 flex items-center gap-3">
                {/* OD-5 / decision 0010 — one per request. */}
                {canDecide && !idea.markedHelpful && !hasHelpfulIdea ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={markHelpful.isPending}
                    onClick={() => markHelpful.mutate({ ideaId: idea.id })}
                  >
                    This one helped
                  </Button>
                ) : null}
                {canPost ? (
                  <button
                    type="button"
                    className="text-[12.5px] text-pencil hover:underline"
                    onClick={() => setReplyTo(replyTo === idea.id ? null : idea.id)}
                  >
                    Reply
                  </button>
                ) : null}
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
                      </p>
                      <p className="mt-1 max-w-measure text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
                        {reply.body}
                      </p>
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
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={
                      countWords(replyBody) < IDEA_WORDS.min ||
                      countWords(replyBody) > IDEA_WORDS.max ||
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

      {canPost ? (
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
            {IDEA_WORDS.max})
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
      ) : !signedIn ? (
        <p className="mt-6 text-[13.5px] text-ink-soft">Sign in to add an idea.</p>
      ) : null}

      {markHelpful.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {markHelpful.error.message}
        </p>
      ) : null}
    </section>
  )
}
