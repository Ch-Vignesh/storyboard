# 0018 — A suspended account keeps its work

**Date:** 2026-09-15
**Status:** accepted
**Implements:** FR-13.5, which says an account is suspended pending review but
does not say what happens to what they wrote

## The decision

Suspension freezes the person, not the work.

| Thing                                    | While suspended                                             |
| ---------------------------------------- | ----------------------------------------------------------- |
| Signing in                               | refused                                                     |
| Writing, suggesting, reporting, inviting | refused                                                     |
| Their public storyboards                 | still readable                                              |
| Their credits on other people's work     | still shown                                                 |
| Their name on revisions they wrote       | still there                                                 |
| Email to them                            | none (decision in phase 3 already skips suspended accounts) |

## Why

FR-13.5 suspends on **ten upheld reports pending review** — the phrase is
"pending review", which means nobody has decided anything yet. Taking a
manuscript down at that point is a punishment ahead of a judgement.

More to the point, their work is not only theirs. A credit sits on somebody
else's contributors page; a revision they wrote was accepted into somebody
else's chapter. Hiding a suspended person's work would silently alter a third
party's manuscript because of an accusation against a stranger. Principle 1.3.3
says the record outlives the text, and decision 0013 already established that
removing a name from the record is the person's own choice and never something
done _to_ them.

So the account is frozen and the record stands.

## What this does not do

It does not stop an abusive storyboard being readable while the report queue is
worked through. That is a real cost and it is accepted with open eyes: the
answer to abusive _content_ is FR-2.6's delete and the admin screens in FR-15.5,
which act on the storyboard directly. Suspension is the answer to an abusive
_account_, and conflating the two would make both blunter.

## What was also considered

- **Hiding their storyboards too.** Rejected above: it punishes before a
  decision and it breaks links that strangers hold.
- **A banner saying the account is under review.** Rejected: it publishes an
  accusation that nobody has upheld yet, on a page other people's names appear
  on.

## Where it lives

`lib/authz` — a suspended actor fails `can()` for every write action, at the
data layer as NFR-6 requires, rather than at each route. Reading is untouched.

Related: [[0013-erasing-a-contribution-record]], which draws the same line from
the other side.
