-- Phase 14, item 6.15 (FR-11.3, FR-12.2, D-8): the author is told once when a
-- request of theirs closes by itself, so they can open it again if they still
-- want help.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own. Additive only.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_AUTO_CLOSED' BEFORE 'WEEKLY_DIGEST';
