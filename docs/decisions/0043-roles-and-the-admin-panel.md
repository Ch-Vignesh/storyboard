# 0043 — Roles and the admin panel

**Date:** 2026-10-18
**Status:** accepted 2026-10-18; built as milestone 2b of `06-completion-plan.md` (items 2b.1 to 2b.7, all done the same day)
**Amends:** FR-15.5 (admin screens) and the roles in `01-srs.md` §3.1, which are roles on a story, not on the place

## Why

Running Draftboard is one person's time (FR-13.7). The code knows that
person only as `User.isAdmin`, a flag with no interface, set by hand in the
database. The admin screens that exist are the report queue, suspended
accounts, the seed manager and feature flags; nothing shows how many people
are here or who signed in lately, nothing bans a name, and an account can
only be suspended by ten upheld reports, never by a decision.

On 2026-10-18 the owner asked for the basics of an admin panel: how many
members, who has signed in, delete or ban an account, ban a username; and for
roles: one admin, for ever and only one, so the place stays centralised;
sub-admins with the admin's permissions minus whatever the admin withholds;
and everyone else a user.

## The decision

**Roles.** `User.role` is `USER`, `SUB_ADMIN` or `ADMIN`, with `USER` the
default. Exactly one row may be `ADMIN`, enforced by a partial unique index as
the other one-of-a-kind rules are (decision 0003). `isAdmin` is backfilled
into `role` and then read nowhere; the column goes in a later, non-additive
phase.

**The admin is set from the command line, never from the interface.**
`pnpm admin:grant <email>` runs against the direct database URL, makes that
account the admin and demotes the previous one to a user. A compromised
admin session therefore cannot hand the role on, and there is no screen on
which to do it by mistake.

**Capabilities, not a second flag.** A fixed list, in `lib/authz`:
`overview.read`, `reports.decide`, `accounts.suspend`, `accounts.delete`,
`names.ban`, `seeds.manage`, `flags.toggle`, `events.read` (item 10.2),
`errors.read` (item 10.1), and `roles.manage`, which no grant can confer: it
is the admin's alone, and it is what makes a sub-admin and sets their grants.
A greater power carries the lesser: `accounts.delete` includes
`accounts.suspend`, since the People screen that deletes is the one that
suspends. The admin has all of them. A sub-admin has the
ones in `SubAdminGrant { userId, capability, grantedById, grantedAt }`,
granted and revoked by the admin alone; making a sub-admin a user again
deletes their grants. A sub-admin cannot grant, cannot touch the admin's
account, and cannot see other sub-admins' grants.

**Enforced at the data layer (NFR-6).** `canAdmin(actor, capability)` in
`lib/authz`, with a test per capability and role, and an
`adminProcedure(capability)` builder in tRPC on top of `activeProcedure`, so
a suspended or deleting sub-admin loses their powers with their status. Every
existing admin procedure moves onto it. Pages read the same function; the
proxy keeps `/admin` behind sign-in and decides nothing else.

**The panel, under `/admin`.**

- _Overview:_ members in all, new in the last 7 and 30 days, signed in within
  the last 7 and 30 days, stories, open requests, suggestions sent and
  accepted. "Signed in" needs `User.lastSeenAt`, touched at most once an hour
  by the session read, which is already a database round trip.
- _People:_ find an account by exact username or email; see its status, role,
  grants, and its upheld and open report counts. Suspend with a note, lift,
  ban (a suspension that the report review does not lift, with `bannedAt`),
  delete (the same scheduled deletion the person could start themselves,
  decision 0024: frozen at once, erased after the grace), and, for the admin,
  grant and revoke sub-admin capabilities.
- _Names:_ ban a username. `RetiredUsername` gains a `reason` (`RETIRED` or
  `BANNED`) and a note, and is renamed when a non-additive phase allows it;
  the username step refuses both kinds with the same sentence.
- The existing _Reports_, _Seeds_ and _Flags_, and later _Errors_ and
  _Events_, each behind its capability.

**What this does not change.** Suspension by ten upheld reports (FR-13.5)
and its lifting; that a suspended person keeps their work (decision 0018);
what deleting an account means (decision 0024); and the story roles of
§3.1, which are about a story and stay as they are.

## Consequences

Admin actions are among the socially significant events (NFR-7): each writes
a log line now and a stored event once item 10.2 lands, naming who did it.
Seven items in milestone 2b; 2.8 (suspend by hand) is folded into 2b.5.
