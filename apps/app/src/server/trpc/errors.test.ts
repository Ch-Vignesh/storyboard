/**
 * What reaches the browser when a procedure fails.
 *
 * On 2026-10-15 the code for the password reset went live before its
 * migration, and the sign-up form showed a stranger Prisma's own words: "The
 * column `User.passwordChangedAt` does not exist in the current database". A
 * message a procedure wrote for people still has to arrive intact; anything a
 * library threw has to arrive as ours, and nothing more.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { TRPCError } from '@trpc/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const LEAK = 'Invalid `prisma.user.findUnique()` invocation: The column does not exist'

async function failWith(error: Error): Promise<{ message: string; code: string }> {
  const { createTRPCRouter, publicProcedure } = await import('./init')
  const router = createTRPCRouter({
    fail: publicProcedure.query(() => {
      throw error
    }),
  })
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request('http://localhost/api/trpc/fail'),
    router,
    createContext: () => ({
      db: {} as never,
      session: null,
      account: null,
      headers: new Headers(),
    }),
  })
  const body = (await response.json()) as {
    error: { json: { message: string; data: { code: string } } }
  }
  return { message: body.error.json.message, code: body.error.json.data.code }
}

describe('errors on their way to the browser', () => {
  it('says the fault is ours, and not what the library said', async () => {
    const { SERVER_FAULT_MESSAGE } = await import('./init')
    const shown = await failWith(new Error(LEAK))

    expect(shown.code).toBe('INTERNAL_SERVER_ERROR')
    expect(shown.message).toBe(SERVER_FAULT_MESSAGE)
    expect(shown.message).not.toContain('prisma')
  })

  it('passes on a message a procedure wrote for people', async () => {
    const shown = await failWith(new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' }))

    expect(shown).toEqual({ message: 'Unknown genre.', code: 'BAD_REQUEST' })
  })
})
