-- FR-5.9 (2026-10-16 spec review): reopening a request tells everyone who
-- ever sent a suggestion to it that it is open again.
--
-- It sent them "the section you helped with changed" instead, the stale
-- notification, which is neither what happened nor something they can act
-- on, and sent it to people who had only opened a draft as well.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_REOPENED' BEFORE 'WEEKLY_DIGEST';
