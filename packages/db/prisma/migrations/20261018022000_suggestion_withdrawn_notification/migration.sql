-- FR-6.5 (phase 14, item 1.10): a suggestion withdrawn after an author had
-- opened it tells the story's authors, hourly. Withdrawal used to change the
-- state and nothing else.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own. Additive only.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUGGESTION_WITHDRAWN' BEFORE 'WEEKLY_DIGEST';
