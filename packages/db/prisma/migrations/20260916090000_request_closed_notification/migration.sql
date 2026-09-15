-- FR-2.7 and FR-14.1: tell somebody their request is no longer open.
--
-- Both paths already closed open requests and neither said so. A contributor
-- part-way through a suggestion learned about it by coming back and finding
-- the passage gone — and in the going-private case, finding the whole
-- storyboard gone, because a private storyboard answers 404 to a stranger.
--
-- Postgres cannot add an enum value inside a transaction that then uses it,
-- which is why this is a migration of its own and not part of a larger one.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_CLOSED' BEFORE 'WEEKLY_DIGEST';
