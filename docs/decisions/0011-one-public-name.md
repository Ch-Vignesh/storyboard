# 0011 — One public name; no pen names in v1

Date: 2026-09-14 · Status: accepted · Resolves: OD-2

## Context

`01-srs.md` section 9 leaves OD-2 open and it blocks phase 3, which builds
profiles and the credits surfaces. Can someone contribute under a pseudonym
separate from their account?

The case for yes is real: writers use pen names, and a person may not want a
half-finished contribution to a stranger's novel attached to the name they
publish under.

## Decision

No. One account, one public name.

`User.username` is chosen once, is immutable (FR-1.3), owns the profile URL, and
is what every credit line resolves to. `User.displayName` is editable and is
what the interface shows, so a writer can present as "L. Brandt" rather than
"leah" without a second identity existing.

The reason is that a credit is the product. FR-9.1 makes it permanent and
addressable, principle 1.3.3 says removing the writing does not remove the
record, and FR-9.5 carries credits across spin-offs. A credit that points at an
identity the reader cannot resolve is not a credit; it is a decoration. Once
several of those exist, they cannot be unwound without rewriting other people's
history.

It also keeps FR-13.5 workable: report counts are per account, and suspension is
per account. A pseudonym layer means every moderation decision has to resolve a
display name back to a person anyway, which is the complexity without the
privacy.

## Consequences

- No schema change. `displayName` already exists and is already what the
  interface renders; phase 3 makes it editable in settings.
- Phase 3 can build profiles, the contribution calendar and the credits export
  against a single stable identity.
- FR-9.4 still protects the sensitive case it was written for: suggestions that
  were passed on are collapsed and visible only to their author by default.
  That is the real privacy need — not being seen to have tried and not been
  used — and it does not require a second name.
- This is reversible in the permissive direction and not in the other. Adding
  pen names later is a migration; taking them away after credits exist is not.
  If writers ask for them, revisit with real demand rather than in advance.
