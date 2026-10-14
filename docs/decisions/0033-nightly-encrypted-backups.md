# 0033 — Nightly encrypted backups, and a drill every week

**Date:** 2026-10-14
**Status:** accepted
**Implements:** NFR-8; phase 11, tasks 2 and 3
**Amends:** 0028, which left NFR-8 open on Prisma's Free plan

## Why

NFR-8 asks for a daily backup kept for 30 days before the first real user.
Prisma Postgres on the Free plan keeps no snapshots at all, and Business, the
plan whose snapshots last 30 days, is a monthly bill for a product with no
users. So the backup is ours: `.github/workflows/backup.yml`, the same
scheduler that already runs the product's jobs (decision 0030).

## What it does

**Every night**, at 21:30 UTC: `pg_dump` over the direct host, in the custom
format, of the `public` schema, which is where every migration writes. Then a
check that the dump holds data for the tables that make it a backup of _this
product_ (the migration ledger, users, storyboards, sections, revisions). Then
GnuPG encryption, AES-256, with a passphrase. The result goes to an R2 bucket
under a name stamped to the minute. The upload is read back and its size
compared.

**Every Sunday**, the drill: the newest backup is fetched, decrypted, and
restored into an empty PostgreSQL 17, then `pnpm db:drill` runs against it.
That is the "restore drill, for real" that phase 11 asks for, dated in the
run's summary, and it runs every week without anybody having to remember.

The drill also refuses a newest backup more than 36 hours old. A backup job that
has quietly stopped looks, from the outside, exactly like one that works; the
drill is what notices.

`packages/db/scripts/backup.sh` and `restore.sh` do the work, so a restore on
a laptop is the same commands the workflow runs.

## The choices, and what each costs

**A bucket and a token of their own.** The application's R2 key lives in the
server's environment. Anybody who took the server would hold it, and if it could
reach the backups it could delete them. The backup token can reach only the
backup bucket, and the application's token cannot reach it at all. That has to
be checked rather than assumed, because a Cloudflare token can just as easily
be made for every bucket in the account. Once the backup bucket exists, a write
to it with the application's key must answer `AccessDenied`.

**A bucket lock, and a lifecycle rule.** A token that can write objects can
also delete them; R2 has no write-only permission. A lock on the bucket refuses
every delete and overwrite for 30 days, whoever asks, the backup token included.
The lifecycle rule then removes each backup once its lock has expired. Both are
set in the Cloudflare dashboard, not in code.

**A passphrase, not a key pair.** With a public key in GitHub and the private
key offline, the job could write backups it could not read. That sounds
stronger than it is. The same job holds the database's connection string, which
reads everything directly, and the weekly drill needs to decrypt. Symmetric
encryption keeps one secret instead of two. And GnuPG ships with Git for
Windows, so a restore on the owner's laptop needs nothing installed. The
passphrase also lives somewhere that is not GitHub. A backup nobody can decrypt
is not a backup.

**The `public` schema only.** A managed server has schemas of its own, for its
provider, that this application neither owns nor needs back. A fresh database
already has a `public` schema, so `restore.sh` skips the two entries that create
and describe it. Everything inside it restores as it was.

**PostgreSQL 17 client tools**, from the PostgreSQL project's apt repository.
`pg_dump` refuses a server newer than itself. A dump from 17 restores only into
17 or newer: it sets `transaction_timeout`, which 16 does not know. That was
found in the rehearsal, restoring into the local 16.

**`verify-full`, whatever the stored string says.** The workflow appends
`sslmode=verify-full&sslrootcert=system` to the connection string. libpq takes
the last value of a repeated parameter, which was checked with a local server
before this relied on it.

**All or nothing.** `restore.sh` restores in one transaction and stops at the
first error. A restore aimed at a database that already has tables refuses at
its first `CREATE` and changes nothing. That was checked too, deliberately.

**Quiet logs.** The repository is public, and so are its Actions logs. The drill
runs with `--quiet`: whether each check passed, not the row counts (how many
people have signed up) or the title of the storyboard it read (which may be
private).

## Rehearsed

On 2026-10-14, against the seeded local database: `backup.sh` with `pg_dump`
17.10, `restore.sh` into an empty PostgreSQL 17, and `pnpm db:drill`, which
passed all five checks, in full and with `--quiet`. A wrong passphrase was
refused at decryption. A second restore into the now-full database was refused
at its first `CREATE TYPE`, and the database was unchanged.

The workflow itself runs only on GitHub, so its first real run is the proof
that the secrets, the bucket and the production database are what this record
says.
