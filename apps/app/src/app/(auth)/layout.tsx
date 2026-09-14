import Link from 'next/link'

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-6 py-16">
      <Link
        href="/signin"
        className="font-manuscript text-[21px] font-medium tracking-tight text-ink"
      >
        Storyboard
      </Link>
      <div className="mt-12">{children}</div>
    </main>
  )
}
