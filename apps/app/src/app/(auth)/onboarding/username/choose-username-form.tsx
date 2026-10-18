'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useState } from 'react'

import { withNext } from '@/lib/safe-next'
import { usernameSchema } from '@/lib/schemas/auth'
import { USERNAME_CHARS } from '@/lib/schemas/constants'
import { USERNAME_PERMANENCE_WARNING } from '@/lib/schemas/onboarding'
import { useTRPC } from '@/trpc/client'

/**
 * FR-1.3 step 3. Item 3.7: a refused name says why, under the field, instead
 * of only greying out the button; the browser's own pattern check is gone
 * (its hyphen was invalid in `v` mode, so it never ran); and password
 * managers are not invited to fill the address in, which `autoComplete=
 * "username"` did.
 */
export function ChooseUsernameForm({ next = '/' }: { next?: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const { update } = useSession()
  const [username, setUsername] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  // Deferred so a fast typist does not fire a query per keystroke.
  const candidate = useDeferredValue(username.trim().toLowerCase())
  const parsed = usernameSchema.safeParse(candidate)
  const wellFormed = parsed.success
  // The first thing wrong with it, in the schema's words; nothing while empty.
  const problem = candidate && !parsed.success ? (parsed.error.issues[0]?.message ?? null) : null

  const availability = useQuery({
    ...trpc.user.usernameAvailable.queryOptions({ username: candidate }),
    enabled: wellFormed,
    staleTime: 30_000,
  })

  const chooseUsername = useMutation(
    trpc.user.chooseUsername.mutationOptions({
      onSuccess: async (result) => {
        // Refresh the token so the proxy stops sending us back here.
        await update({ username: result.username })
        router.replace(withNext('/onboarding/genres', next))
      },
    }),
  )

  const taken = wellFormed && availability.data?.available === false
  const canSubmit = wellFormed && acknowledged && !taken && !chooseUsername.isPending

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) chooseUsername.mutate({ username: candidate })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-[15px] text-ink-faint">
            @
          </span>
          <Input
            id="username"
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_CHARS.max}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={Boolean(problem) || taken || chooseUsername.isError || undefined}
            aria-describedby="username-hint username-status"
          />
        </div>
        <p id="username-hint" className="text-[12.5px] text-ink-faint">
          Lowercase letters, numbers and hyphens. {USERNAME_CHARS.min} to {USERNAME_CHARS.max}{' '}
          characters.
        </p>
        <p id="username-status" role="status" aria-live="polite" className="text-[13px]">
          {problem ? (
            <span className="text-ochre">{problem}</span>
          ) : taken ? (
            <span className="text-ochre">That name is taken.</span>
          ) : wellFormed && availability.data?.available === true ? (
            <span className="text-moss">@{candidate} is available.</span>
          ) : null}
        </p>
      </div>

      {/* FR-1.3: warn at the point of choosing, and make the warning cost a click. */}
      <div className="border border-ochre/35 bg-ochre-wash px-4 py-3.5">
        <p className="text-[13.5px] leading-relaxed text-ink">{USERNAME_PERMANENCE_WARNING}</p>
        <label className="mt-3 flex items-start gap-2.5 text-[13.5px] text-ink">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-pencil"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>I understand this name is permanent.</span>
        </label>
      </div>

      {chooseUsername.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {chooseUsername.error.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full" disabled={!canSubmit}>
        {chooseUsername.isPending ? 'Saving' : 'Take this name permanently'}
      </Button>
    </form>
  )
}
