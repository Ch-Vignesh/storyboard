'use client'

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCContext } from '@trpc/tanstack-react-query'
import { useState } from 'react'
import superjson from 'superjson'

import type { AppRouter } from '@/server/trpc/routers/_app'

import { makeQueryClient } from './query-client'

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()

let browserQueryClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  // On the server every request gets its own client; in the browser one is shared.
  if (typeof window === 'undefined') return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

function getUrl(): string {
  const base =
    typeof window !== 'undefined'
      ? ''
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  return `${base}/api/trpc`
}

export function TRPCReactProvider(props: Readonly<{ children: React.ReactNode }>) {
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ transformer: superjson, url: getUrl() })],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
