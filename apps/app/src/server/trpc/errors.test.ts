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
import { z } from 'zod'

vi.mock('@/auth', () => ({ auth: async () => null }))

const LEAK = 'Invalid `prisma.user.findUnique()` invocation: The column does not exist'

async function failWith(error: Error, path = 'fail'): Promise<{ message: string; code: string }> {
  const { createTRPCRouter, publicProcedure } = await import('./init')
  const router = createTRPCRouter({
    fail: publicProcedure.query(() => {
      throw error
    }),
    // Input validation, the way every form's input is checked.
    tone: publicProcedure
      .input(z.object({ tone: z.string().max(5, 'Keep the tone notes short.') }))
      .query(() => 'fine'),
  })
  const input = encodeURIComponent(JSON.stringify({ json: { tone: 'far too long a note' } }))
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(
      path === 'tone'
        ? `http://localhost/api/trpc/tone?input=${input}`
        : 'http://localhost/api/trpc/fail',
    ),
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

  // Phase 12 audit: tRPC's message for bad input is the issue list as JSON.
  it('says what is wrong with the input in the words the schema gave it', async () => {
    const shown = await failWith(new Error('unused'), 'tone')

    expect(shown).toEqual({ message: 'Keep the tone notes short.', code: 'BAD_REQUEST' })
  })

  it('passes on a message a procedure wrote for people', async () => {
    const shown = await failWith(new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' }))

    expect(shown).toEqual({ message: 'Unknown genre.', code: 'BAD_REQUEST' })
  })
})
