# 0026 — No age gate

**Date:** 2026-09-15
**Status:** accepted
**Supersedes:** the first half of decision 0020. The second half of 0020 — no
private messages, ever — is untouched and still in force.
**Reopens:** OD-7, which 0020 closed.

## The decision

The "I am 13 or older" checkbox is removed from sign-up. No age is asked, no age
is stored, and nothing in the product refers to one.

Sign-up now asks for an email address and nothing else.

## Why

The product owner's reasoning: somebody under thirteen is not writing a novel
and looking for line edits on it, so a checkbox asking them to confirm they are
thirteen is a box nobody who matters is failing to tick. It adds a step to the
one screen where a step costs the most, in exchange for an assertion nobody
verifies.

That is a real argument. The gate was never a verification — decision 0020 said
so itself — and an unverified claim collected once is close to a ritual.

## What was said against it, and recorded here on purpose

This was flagged before it was carried out, and the record should show it rather
than read as though the trade were free.

An age gate is not really about who writes books. It is a liability posture.
COPPA in the United States and GDPR Article 8 in the EU both attach obligations
to a service that **knowingly** collects personal data from a child, and an
unticked box is the ordinary evidence of not knowing. Without it, the product
has no documented moment where it asked, which is a weaker position than having
asked and been told something untrue.

The counterweight, and the reason this is defensible rather than merely
cheaper: the protective work in decision 0020 was never done by the checkbox. It
was done by the second half, which stands. There is no private messaging here
and there is not going to be; every way one person can reach another is attached
to a piece of writing and visible to everyone who can read it. The specific harm
an age gate is usually reached for — an adult stranger sending a child something
only the child will see — has no surface in this product to occur on.

## What this changes

| Where                   | What happened                                           |
| ----------------------- | ------------------------------------------------------- |
| Sign-up form            | the checkbox is gone; the button is no longer gated     |
| Community rules, rule 6 | now "Nothing here is private" — the messaging half only |
| Marketing page          | both age lines removed                                  |
| `flow-9-launch.spec.ts` | the gate test is replaced by one asserting its absence  |

Nothing on the server changed, because nothing on the server ever knew: the
checkbox was never sent, never validated and never stored. Which is its own
small finding — the gate could always have been bypassed by anything that was
not the form — and it is now moot rather than outstanding.

## OD-7 is open again

Decision 0020 closed OD-7 with two halves. One is withdrawn, so the open
decision is open again, with a narrower question than it started with: _is the
absence of any private surface sufficient on its own, or does this product
eventually need an age for a reason other than messaging?_

Phase 10 is where that gets answered, from what the report queue actually fills
up with. If the answer ever becomes "we need one", this record is the argument
that has to be beaten, and the checkbox is an afternoon to restore.
