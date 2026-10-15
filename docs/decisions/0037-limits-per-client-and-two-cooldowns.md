# 0037 — Limits per client, and two cooldowns

**Date:** 2026-10-15
**Status:** accepted
**Implements:** FR-13.3 for the surfaces before sign-in; FR-1.3 and FR-1.4
**Amends:** 0017, whose limits were all per person or per address

## Why

The phase 12 audit found the unauthenticated surfaces limited only by the
address being typed. Nothing limited sign-in at all, so a script could guess a
person's password for as long as it liked, and each guess cost an Argon2 hash.
Sign-up, resend and reset were limited per address. A script that typed a new
address each time could send without end, and Gmail stops sending at about 500
a day (decision 0029). After that, every real sign-up and reset would fail
until the next day.

The audit also found that the one-minute rhythm, meant to keep any kind of
address from giving itself away, did not. An address with an account kept it
on one key and an address without one on another. Asking two of the forms in
turn told a stranger which kind of address they had typed.

## The decision

**A limit per client, beside the limits per address.** The client is the first
entry of `x-forwarded-for`, which Vercel's edge writes and a client cannot
forge (`server/client-address.ts`). The numbers are in `AUTH_LIMITS`:

- Auth emails: 20 a day from one client, whatever addresses it types.
- Sign-in: 10 attempts at one address from one client in 15 minutes, and 30
  from one client in all. The first is keyed on the client as well as the
  address, so a stranger guessing at someone's password cannot lock the real
  owner out from their own device. A refused attempt says so ("Too many
  sign-in attempts"); it is never reported as a wrong password.

**Loopback is no client.** Run locally, Next stamps every request with the
loopback address, so every browser flow counted as one client and the
twenty-first sign-up got no email. A loopback address is the machine itself.
It is treated like a missing header: the per-client limits are skipped and the
per-address ones still apply. On Vercel the address is never loopback.

**Two cooldowns, each taken before the address is looked up.** One is for
confirmation links (sign-up and resend share it, which keeps FR-1.4's minute
between links). The other is for reset links. Taken before the lookup, every
kind of address answers alike within each family. They are two families
rather than one so that somebody who signs up and at once forgets their
password is not told to wait. The single shared key first tried did exactly
that, and the forgot-password browser flow caught it.

**Addresses are hashed in limit keys.** `RateLimitHit.key` holds 200
characters and an address may hold 254. A long address was a server error on
sign-up. The table also has no business keeping addresses in the clear for a
day.

## What it does not do

It does not stop a distributed attacker: many clients each under the limit
still add up. The per-address limits and Gmail's own refusal are what stand
there, and a real sending domain (Resend, waiting on OD-1) is the remedy. Nor
does it limit anything after sign-in by client. Those surfaces have a person
to key on, and decision 0017's limits do.
