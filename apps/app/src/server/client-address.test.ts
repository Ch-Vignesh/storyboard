import { describe, expect, it } from 'vitest'

import { clientAddress } from './client-address'

describe('clientAddress', () => {
  it('takes the first entry Vercel’s edge wrote', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }))).toBe(
      '203.0.113.7',
    )
  })

  it('falls back to x-real-ip', () => {
    expect(clientAddress(new Headers({ 'x-real-ip': ' 203.0.113.8 ' }))).toBe('203.0.113.8')
  })

  // Next stamps local requests with the loopback address; that is the machine.
  it('counts this machine as no client', () => {
    for (const loopback of ['::1', '127.0.0.1', '::ffff:127.0.0.1', '127.1.2.3']) {
      expect(clientAddress(new Headers({ 'x-forwarded-for': loopback })), loopback).toBeNull()
    }
    expect(clientAddress(new Headers({ 'x-forwarded-for': '128.0.0.1' }))).toBe('128.0.0.1')
  })

  it('says nothing rather than guessing', () => {
    expect(clientAddress(new Headers())).toBeNull()
    expect(clientAddress(new Headers({ 'x-forwarded-for': ' ' }))).toBeNull()
  })
})
