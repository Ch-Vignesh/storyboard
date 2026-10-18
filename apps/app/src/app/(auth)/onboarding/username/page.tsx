import type { Metadata } from 'next'

import { safeNext } from '@/lib/safe-next'

import { ChooseUsernameForm } from './choose-username-form'

export const metadata: Metadata = { title: 'Choose your name' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** FR-1.3 step 3. The warning is the point of this screen, so it is not fine print. */
export default async function ChooseUsernamePage({ searchParams }: Props) {
  // Item 3.5 — where they were going, carried to the next step.
  const next = safeNext((await searchParams).next)

  return (
    <>
      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        Choose your name
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
        This is how you appear to other writers, and how you are credited when someone accepts your
        help.
      </p>
      <ChooseUsernameForm next={next} />
    </>
  )
}
