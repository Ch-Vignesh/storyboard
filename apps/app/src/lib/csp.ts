/**
 * The Content-Security-Policy (OD-10, phase 9).
 *
 * The product renders prose that strangers wrote, so the question this answers
 * is: if an injection ever got through the restricted document model, what
 * could it do? Without a policy, anything. With this one, it cannot run a
 * script, load one from anywhere, post a form off-site, or be framed.
 *
 * **Scripts are nonce-based, with `strict-dynamic`.** A per-request nonce is
 * the only thing that works with the App Router, which inlines a bootstrap
 * script and streams more. `strict-dynamic` is what lets that bootstrap load
 * the rest of the chunks: modern browsers then ignore `'self'` entirely and
 * trust only what a trusted script loads. The `'self'` is left in for browsers
 * that do not understand `strict-dynamic`, where it is the fallback rather than
 * a loosening.
 *
 * **Styles allow `'unsafe-inline'`, and that is deliberate.** CSP governs
 * `style` *attributes*, not just `<style>` tags, and a nonce cannot authorise
 * an attribute — only `'unsafe-inline'` or a hash of each exact value can. The
 * contents editor sets `style={{ transform }}` on whatever is being dragged, a
 * value that changes every frame, so hashing is not available even in
 * principle. The trade is worth naming plainly: an attacker who could inject
 * markup could restyle a page. They could not run anything, which is the
 * property that matters, and `script-src` is where this policy is strict.
 *
 * Kept next to the proxy rather than in `next.config.ts` because a nonce has to
 * be minted per request, and a header in the Next config is static.
 */

/** A fresh nonce. Base64 of 16 random bytes; `crypto` is available on the edge. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

export function contentSecurityPolicy(nonce: string, { isDev }: { isDev: boolean }): string {
  const directives: string[] = [
    `default-src 'self'`,
    // `unsafe-eval` in development only: the dev server compiles and evaluates
    // on the fly, and a policy that made `pnpm dev` unusable would be turned
    // off by the first person it inconvenienced.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // See the note above. Not an oversight.
    `style-src 'self' 'unsafe-inline'`,
    // `next/font` self-hosts at build time, so no font host is needed.
    `font-src 'self'`,
    // No remote images anywhere in the product; data: and blob: are what an
    // export preview and a file picker use.
    `img-src 'self' data: blob:`,
    // tRPC and the upload endpoint are same-origin. R2 presigned PUTs are not,
    // so the bucket's host is added below when there is one.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ]

  if (!isDev) directives.push('upgrade-insecure-requests')

  return directives.join('; ')
}

/**
 * The R2 account host, so a presigned upload can be reached from the browser.
 *
 * FR-3.1 sends the file straight to the object store, which is a cross-origin
 * PUT and therefore `connect-src`. Without this the upload fails with a CSP
 * error rather than a CORS one, which is a different confusing message for the
 * same missing configuration.
 */
export function withObjectStore(policy: string, accountId: string | undefined): string {
  if (!accountId) return policy
  const host = `https://${accountId}.r2.cloudflarestorage.com`
  return policy.replace(`connect-src 'self'`, `connect-src 'self' ${host}`)
}
