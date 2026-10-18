# 0042 — A deleted account's username stays retired

**Date:** 2026-10-18
**Status:** accepted; confirmed by the owner on 2026-10-18 (D-4 in `06-completion-plan.md`), with one change to the wording, below
**Extends:** decisions 0011 (one public name) and 0024 (deleting an account keeps the writing)

## Why

The purge that erases a deleted account (decision 0024) set its username to
null, and the username step checked only current accounts. So a name could
be taken again by a stranger the day after its owner was erased.

That name is not a free label. It is printed in credit lines (FR-9.6), in
every exported manuscript's front matter (FR-14.3), and as `/@name` wherever
a former member's work is still linked. A stranger who took it would inherit
every one of those addresses, and a book already in print would point at
them.

## The decision

- A new table, `RetiredUsername { hash, retiredAt }`. The purge writes the
  SHA-256 of the lower-cased username in the same transaction that erases
  the account. The hash is not secrecy: a username has too little entropy
  for that, and the name is already printed in the places above. It is only
  so that the table of erased people does not read as a list of them.
- `user.chooseUsername` and `user.usernameAvailable` refuse a retired name
  exactly as they refuse a taken one: "That username is taken. Try another."
  The owner asked that nothing say an account was deleted; the name simply
  goes silent. The unique index on `User.username` remains the check against
  live names.
- Retired for ever, and for everyone: the person who gave the name up and
  comes back cannot take it again either, because nothing ties a new account
  to the erased one, and nothing of the erased account may ever transfer to
  whoever holds the name next. The owner's words: once gone, it's gone. The
  writing that was public stays readable, as a former member's.

## What it does not cover

Accounts erased before this change left no record of their names, so those
names remain free. There were few, and nothing can be done about it after
the fact without the names, which were deliberately not kept.
