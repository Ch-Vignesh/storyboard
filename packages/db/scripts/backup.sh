#!/usr/bin/env bash
# One backup (NFR-8, decision 0033): a dump of the product's data, checked,
# then encrypted. Writes one file; where it goes after that is the caller's
# business — the nightly workflow uploads it to R2.
#
#   BACKUP_DATABASE_URL=… BACKUP_PASSPHRASE=… bash packages/db/scripts/backup.sh out.dump.gpg
#
# BACKUP_DATABASE_URL is the direct host (db.prisma.io), never the pooled one:
# pg_dump reads everything inside one long transaction, which a
# transaction-mode pooler hands to somebody else halfway through.
#
# PG_BIN names a directory of PostgreSQL client tools, for when the ones on
# PATH are older than the server — pg_dump refuses to dump a newer server.
#
# Restore with restore.sh, which is this in reverse.
set -euo pipefail

out=${1:?usage: backup.sh <output file>}
: "${BACKUP_DATABASE_URL:?is not set}"
: "${BACKUP_PASSPHRASE:?is not set}"
bin=${PG_BIN:+$PG_BIN/}

# The plaintext dump never outlives this script, whatever happens in it.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Custom format: compressed, and pg_restore can list it, reorder it, or take one
# table out of it. Only `public`, which is where every migration writes;
# anything else on a managed server is the provider's, and not ours to restore.
# No owners or grants: the database this comes back into has its own roles.
"${bin}pg_dump" --format=custom --schema=public --no-owner --no-privileges \
  --file="$work/dump" "$BACKUP_DATABASE_URL"

# A dump that exited 0 is not a dump that holds the product. These are the
# tables that, missing, would make it useless: the migration ledger the
# application checks at start, the people, and the writing.
contents=$("${bin}pg_restore" --list "$work/dump")
for table in _prisma_migrations User Storyboard Section Revision; do
  if ! grep -q " TABLE DATA public ${table} " <<<"$contents"; then
    echo "The dump has no data for ${table}. Nothing was encrypted or kept." >&2
    exit 1
  fi
done
tables=$(grep -c ' TABLE DATA ' <<<"$contents")

# Symmetric, so the job that writes a backup and the drill that reads one need
# the same single secret (decision 0033). The dump is compressed already.
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --compress-algo none \
  --output "$out" "$work/dump" 3<<<"$BACKUP_PASSPHRASE"

echo "Backed up ${tables} tables: $(wc -c <"$out" | tr -d ' ') bytes, encrypted."
