-- Phase 14, item 7b.4 (decision 0044, FR-10.3, FR-10.6): the authors of a story
-- are told when a spin-off of it publishes an edition.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own. Additive only.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPIN_OFF_PUBLISHED' BEFORE 'WEEKLY_DIGEST';
