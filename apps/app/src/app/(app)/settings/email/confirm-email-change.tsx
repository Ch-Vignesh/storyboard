'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import Link from '@/components/link'

import { useTRPC } from '@/trpc/client'

/** Item 3.2 — the button, and what it says once pressed. */
export function ConfirmEmailChange({ token, newEmail }: { token: string; newEmail: string }) {
  const trpc = useTRPC()
  const confirm = useMutation(trpc.auth.confirmEmailChange.mutationOptions())

  if (confirm.isSuccess) {
    return (
      <div className="mt-6 max-w-measure">
        <p role="status" className="text-[15px] leading-relaxed text-ink">
          Done. {newEmail} is now your address, and every device has been signed out.
        </p>
        <p className="mt-4 text-[13.5px]">
          <Link href="/signin" className="text-pencil hover:underline">
            Sign in with it
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <Button
        type="button"
        variant="primary"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({ token })}
      >
        {confirm.isPending ? 'Changing' : 'Make this my address'}
      </Button>
      {confirm.isError ? (
        <p role="alert" className="mt-3 text-[13.5px] text-crimson">
          {confirm.error.message}
        </p>
      ) : null}
    </div>
  )
}
