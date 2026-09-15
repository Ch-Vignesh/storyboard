# 0027 — Signing in with Google, linked by verified email

**Date:** 2026-09-15
**Status:** accepted
**Implements:** FR-1.6, which `01-srs.md` defers and warns against building an
abstraction for early.

## Why now, against the SRS's advice

The SRS says to add OAuth "only if sign-up drop-off says people want it". There
is no drop-off data, because nothing is deployed. The product owner asked for it
in phase 9 anyway, and that is a legitimate call: the data cannot exist until
there is a deployment, and a sign-in option is cheaper to have waiting than to
add under pressure once the funnel says it is missing.

What the SRS's warning is actually about is the _abstraction_, and that part is
honoured. There is one provider and no provider layer. A second one would touch
`auth/google.ts` and nothing else; inventing a registry for one entry would be
precisely the mistake being warned about.

It is inert until configured. With no `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
the provider is not registered and the button is not rendered — not disabled,
not present and failing: absent. A clone of this repository runs without a
Google project, the same way it runs without Cloudflare and without Resend.

## The security decision: linking by verified email

Matching an OAuth identity to an existing account by email address is an
account-takeover vector, and a well-known one. If the provider does not check
that the person actually owns the address, anyone who can claim
`someone@example.com` there inherits that person's account here.

Google does check, and says so in the token as `email_verified`.

So the rule is narrow: **link only when Google asserts the address is verified,
and refuse the sign-in otherwise** — refuse, rather than quietly create a second
account, because a duplicate account on a claimed address is the same problem
with an extra step.

Auth.js offers `allowDangerousEmailAccountLinking`, which would link on email
regardless. It is not set, and the name is doing its job. What this product does
instead lives in `resolveGoogleUser`: the same outcome for the safe case, and a
refusal for the unsafe one.

## No `Account` table, no adapter

Sessions are JWTs (decision 0002) and the only thing a Google sign-in needs to
persist is the `User` row that already exists. Adding an adapter would bring
four tables to store what one email column already answers.

The consequence worth knowing: somebody who signed up through Google has no
password, so the credentials provider refuses them — by the `passwordHash` check
it already made, with no new code. If they want a password later, the existing
verification-link flow sets one.

## What it does not do

**It does not choose a username.** A Google display name is not a username, and
using one would hand somebody a permanent, public identity they never chose —
FR-1.3 is explicit that the username is picked once and is immutable. An account
created through Google arrives with no username, so the proxy sends it to
onboarding exactly as an email sign-up does. Google's name becomes the
`displayName`, which is changeable in settings.

**It does not ask for more than identity.** The scope is `openid email profile`
and nothing else. Every extra scope is data this product would then be holding
and have to protect, for a feature it does not have.

**It does not say why a sign-in failed.** A suspended account and an address
with no account both produce the same generic failure. Distinguishing them would
answer a question strangers should not get to ask.

## One exception, and it is deliberate

An account inside its deletion grace period can sign in with Google, the same as
with a password. Decision 0024 put the undo behind a sign-in, so refusing here
would make it unreachable by exactly the people who need it. `can()` and
`activeProcedure` stop them writing in the meantime.

## What is untested, and why that is acceptable

There is no Google project, so nothing here exercises a real OAuth round trip.
`auth/google.test.ts` covers what is actually this product's to get right: that
an unverified profile is refused and leaves nothing behind, that a verified one
links to the existing account rather than making a second, that addresses are
lowercased so one person is not two accounts, that a suspended account is
refused, and that a leaving one is not.

That Google's OAuth works is not this repository's claim to make. The first real
sign-in is a phase 8 deployment task, alongside the rest of the account work.
