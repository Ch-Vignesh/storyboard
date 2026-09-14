import 'server-only'

import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { createTRPCOptionsProxy, type TRPCQueryOptions } from '@trpc/tanstack-react-query'
import { headers } from 'next/headers'
import { cache } from 'react'

import { createTRPCContext } from '@/server/trpc/init'
import { appRouter, createCaller } from '@/server/trpc/routers/_app'

import { makeQueryClient } from './query-client'

/** One query client per request, shared by every server component in the tree. */
export const getQueryClient = cache(makeQueryClient)

const createContext = cache(async () => createTRPCContext({ headers: await headers() }))

/** Build query options on the server, e.g. `prefetch(trpc.user.me.queryOptions())`. */
export const trpc = createTRPCOptionsProxy({
  ctx: createContext,
  router: appRouter,
  queryClient: getQueryClient,
})

/** Call procedures directly from server components and route handlers. */
export const caller = createCaller(createContext)

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  return <HydrationBoundary state={dehydrate(queryClient)}>{props.children}</HydrationBoundary>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the tRPC helper signature
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(queryOptions: T): void {
  const queryClient = getQueryClient()
  if (queryOptions.queryKey[1]?.type === 'infinite') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    void queryClient.prefetchInfiniteQuery(queryOptions as any)
  } else {
    void queryClient.prefetchQuery(queryOptions)
  }
}
