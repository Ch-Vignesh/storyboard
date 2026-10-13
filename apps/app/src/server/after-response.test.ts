import { describe, expect, it } from 'vitest'

import { afterResponse } from './after-response'

describe('afterResponse (phase 10)', () => {
  it('outside a request, runs the work before returning', async () => {
    const order: string[] = []
    await afterResponse(async () => {
      await Promise.resolve()
      order.push('task')
    })
    order.push('returned')
    expect(order).toEqual(['task', 'returned'])
  })
})
