'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useState } from 'react'

import { USERNAME_PATTERN, usernameSchema } from '@/lib/schemas/auth'
import { USERNAME_PERMANENCE_WARNING } from '@/lib/schemas/onboarding'
import { useTRPC } from '@/trpc/client'

export function ChooseUsernameForm() {
  const trpc = useTRPC()
  const router = useRouter()
  const { update } = useSession()
  const [username, setUsername] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  // Deferred so a fast typist does not fire a query per keystroke.
  const candidate = useDeferredValue(username.trim().toLowerCase())
  const wellFormed = usernameSchema.safeParse(candidate).success

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
        router.replace('/onboarding/genres')
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
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            pattern={USERNAME_PATTERN.source}
            minLength={3}
            maxLength={30}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={taken || chooseUsername.isError || undefined}
            aria-describedby="username-hint"
          />
        </div>
        <p id="username-hint" className="text-[12.5px] text-ink-faint">
          Lowercase letters, numbers and hyphens. 3 to 30 characters.
        </p>
        {taken ? (
          <p role="status" className="text-[13px] text-ochre">
            @{candidate} is taken.
          </p>
        ) : null}
        {wellFormed && availability.data?.available === true ? (
          <p role="status" className="text-[13px] text-moss">
            @{candidate} is available.
          </p>
        ) : null}
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
