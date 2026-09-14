import { Button } from '@storyboard/ui/components/button'

/**
 * Placeholder home. The real hero (a real stuck passage beside a real accepted
 * suggestion, readable without an account) lands in phase 7 (FR-1.1).
 */
export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="font-manuscript text-[21px] font-medium tracking-tight">Storyboard</p>
      <h1 className="mt-16 max-w-[22ch] font-manuscript text-4xl leading-tight font-medium">
        Stuck on chapter four? Ask a writer.
      </h1>
      <p className="mt-6 max-w-prose text-[17px] text-ink-soft">
        Post the passage you cannot get past. Other writers propose prose for exactly that spot. You
        accept the one that fits, and their name stays on it for good.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="primary" size="lg">
          <a href={`${appUrl}/signup`}>Create an account</a>
        </Button>
        <Button asChild size="lg">
          <a href={`${appUrl}/signin`}>Sign in</a>
        </Button>
      </div>
    </main>
  )
}
