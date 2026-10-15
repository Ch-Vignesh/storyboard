import 'server-only'

/**
 * The address a request came from, as the platform reports it, or `null`.
 *
 * On Vercel the first entry of `x-forwarded-for` is the client: Vercel's edge
 * overwrites the header rather than appending to whatever the client sent, so
 * it cannot be forged from outside, and it is never this machine.
 *
 * Run locally there is no edge, and Next stamps every request with the
 * loopback address it arrived on. That is the machine, not a client: counted
 * as one, every sign-up the browser flows make shared one day's allowance,
 * and the twenty-first had no email (phase 12 audit). So loopback, like a
 * missing or empty header, is no address, and the limits that key on a client
 * are skipped while the ones that key on an address still apply.
 */
export function clientAddress(headers: Headers): string | null {
  const candidates = [headers.get('x-forwarded-for')?.split(',')[0], headers.get('x-real-ip')]
  for (const candidate of candidates) {
    const address = candidate?.trim()
    if (address) return isLoopback(address) ? null : address
  }
  return null
}

/** `::1`, and 127.0.0.0/8 written either way. */
function isLoopback(address: string): boolean {
  return address === '::1' || /^(?:::ffff:)?127\./iu.test(address)
}
