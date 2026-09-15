# 0025 — A Content-Security-Policy, with a per-request nonce

**Date:** 2026-09-15
**Status:** accepted
**Resolves:** OD-10, raised during phase 8 and deferred to phase 9 on the
grounds that a strict policy is a real change with a real chance of breaking a
screen quietly.

## Why this product in particular

Storyboard renders prose that strangers wrote, into pages its author reads while
signed in. That is the shape of the problem: a suggestion is untrusted input
from one person, displayed to another person who has a session.

The restricted document model (FR-4.1) is the first defence and a good one —
prose is stored as a constrained node tree, not as markup, so there is nowhere
for a tag to live. A CSP is the second, and the reason to have a second is that
the first is a whitelist somebody will widen one day for a good reason.

## The policy

```
default-src 'self';
script-src 'self' 'nonce-<per request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data: blob:;
connect-src 'self' [https://<account>.r2.cloudflarestorage.com];
frame-ancestors 'none';
form-action 'self';
base-uri 'none';
object-src 'none';
worker-src 'self' blob:;
manifest-src 'self';
upgrade-insecure-requests
```

Enforcing, not report-only. Report-only with nobody reading the reports is a
header that does nothing; the twenty-eight flows and four accessibility scans
are what makes enforcing checkable before anybody else sees it.

## Scripts: a nonce, because the App Router leaves no choice

The App Router inlines a bootstrap script and streams more markup after it.
There is no hash-based policy that survives that, and `'unsafe-inline'` in
`script-src` would make the whole exercise decorative.

So the proxy mints a nonce per request and sets the policy on **both** the
request headers and the response. Both are load-bearing and the reason is not
obvious: the response header is what the browser enforces, and the _request_
header is how Next.js finds the nonce to stamp on the scripts it injects itself.
Set only the response header and every page renders blank, because the
framework's own bootstrap is refused by the policy the framework was not told
about.

`'strict-dynamic'` is what lets that nonce'd bootstrap load the rest of the
chunks. Browsers that understand it ignore `'self'` in `script-src` entirely and
trust only what a trusted script loads; `'self'` stays for the ones that do not,
where it is the fallback rather than a loosening.

## Styles: `'unsafe-inline'`, deliberately, and here is the reason

This is the weak line in the policy and it should not be discovered later as if
it were an oversight.

CSP governs `style` **attributes**, not only `<style>` elements, and a nonce
cannot authorise an attribute — only `'unsafe-inline'`, or a hash of each exact
value, can. The contents editor sets `style={{ transform }}` on whatever is
being dragged; that value changes every frame, so hashing is not available even
in principle.

The trade, stated plainly: somebody who could inject markup could restyle a
page. They could not execute anything, which is the property that matters, and
`script-src` is where this policy is strict.

## What it cost: static rendering, everywhere

This is the part that was not foreseen, and it is the most useful thing in this
record.

A nonce is minted per request. Statically prerendered HTML is written once, at
build time, and cannot carry one. The two are simply incompatible — and the
failure is silent and total. A prerendered page still arrives looking perfectly
normal, because the markup is server-rendered; then every script on it is
refused, because `'strict-dynamic'` makes the browser ignore `'self'` and trust
only what carries the nonce. Nothing is interactive. Nothing in the server log
mentions it.

Five pages were prerendered — sign-up, the community rules, the username step,
and two error pages. **Seventeen flows failed**, and the only thing they had in
common was that each of them clicked something. Read-only assertions passed, so
the signed-out accessibility scans were green while the signed-in one was not.

The fix is `export const dynamic = 'force-dynamic'` on the **root layout**, not
on those five pages. Per-page would be correct today and wrong the moment
somebody adds a sixth, and the symptom of being wrong is a page that looks fine
until you touch it.

The cost, named plainly: five pages that read nothing lose static caching. Every
screen that matters in this product was already rendering per request, because
it is per-user and database-backed. Next's built-in `_global-error` page stays
static — it renders outside the root layout, and it is a message with nothing to
click.

`e2e/csp.spec.ts` is the guard. It asserts the nonce reaches the _markup_ and
not merely the header, listens for the browser's own CSP complaints, and — the
strongest of the three — checks that a form still validates on the client,
because that is what a blocked script actually costs.

## What the matcher change cost

The proxy's `matcher` used to be the list of routes needing a session, which
read well. A policy has to be on every document, and the reader — the page most
people see first — was not in that list.

So the matcher became "every document" and the old list moved into
`lib/protected-routes.ts`, which the proxy now consults. Moving a gate from
framework configuration into a predicate fails silently in both directions: a
public page that starts asking for a password, or a private one that stops.
`protected-routes.test.ts` asserts both, including that `/newsletter` is not
`/new` and that a storyboard whose slug happens to contain "settings" is still
a storyboard.

`api/` is excluded from the matcher, and not for speed: the proxy redirects a
request with no session to `/signin`, and doing that to a tRPC call would turn
every unauthenticated API error into an HTML page. The static headers in
`next.config.ts` cover those routes.

## What this does not do

- It does not stop an author being shown something offensive. That is the
  report queue's job (FR-15.5), not a header's.
- It has no `report-uri`. Violations appear in the browser console and nowhere
  else. A reporting endpoint is worth having once there is real traffic to
  learn from; adding one now would collect reports from a product with no
  users.
- `'unsafe-eval'` is permitted in development only, because the dev server
  compiles and evaluates as it goes, and a policy that made `pnpm dev` unusable
  would be switched off by the first person it inconvenienced.
