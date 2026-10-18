-- FR-6.9, FR-12.2 (phase 14, item 1.9): a reply to an idea tells the person
-- who wrote the idea. Replies told only the story's authors, so a helper
-- never learned that the author had answered them.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own. Additive only.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IDEA_REPLY' BEFORE 'WEEKLY_DIGEST';
