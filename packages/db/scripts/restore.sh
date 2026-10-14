#!/usr/bin/env bash
# Puts one backup into an empty database (NFR-8, decision 0033). The reverse
# of backup.sh: decrypt, then restore.
#
#   BACKUP_PASSPHRASE=… bash packages/db/scripts/restore.sh <file.dump.gpg> "postgresql://…empty…"
#
# Then prove it: pnpm db:drill "postgresql://…the same…"
#
# All or nothing. The restore runs in one transaction and stops at the first
# error, so a database that already has tables in it — the live one, by
# mistake — refuses at its first CREATE TABLE and is left exactly as it was.
#
# PG_BIN names a directory of PostgreSQL client tools, for when the ones on
# PATH are older than the one that made the dump.
set -euo pipefail

in=${1:?usage: restore.sh <file.dump.gpg> <empty database URL>}
target=${2:?usage: restore.sh <file.dump.gpg> <empty database URL>}
: "${BACKUP_PASSPHRASE:?is not set}"
bin=${PG_BIN:+$PG_BIN/}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# A wrong passphrase or a damaged file fails here: the format is authenticated.
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --decrypt --output "$work/dump" "$in" 3<<<"$BACKUP_PASSPHRASE"

# Every database starts with a `public` schema, and a dump taken of that schema
# alone would create it again and stop there. So the two entries that make it
# and describe it are left out; everything inside it restores as it was.
"${bin}pg_restore" --list "$work/dump" |
  sed -E '/ (SCHEMA - public|COMMENT - SCHEMA public) /s/^/;/' >"$work/contents"

"${bin}pg_restore" --single-transaction --exit-on-error --no-owner --no-privileges \
  --use-list="$work/contents" --dbname="$target" "$work/dump"

echo "Restored $(basename "$in"). Now run: pnpm db:drill \"<the same URL>\""
