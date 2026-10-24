-- Phase 14, item 10.6: the two schema changes the phase 12 audit left for "the
-- next migration". Additive: an index and a nullable column, so it can be
-- applied before the code that uses them.

-- FR-12.3 (audit M15): the immediate and hourly runs read the notifications
-- not yet emailed, oldest first (`pendingOfTypes` in server/mail/digests.ts),
-- and nothing indexed that. Partial, because once a row is emailed it never
-- leaves that state, so the index holds only the queue however long the table
-- grows. Prisma's schema cannot express a partial index unless its
-- `partialIndexes` preview feature is enabled, which this schema does not do:
-- like `one_main_per_storyboard` (decision 0003) and `one_admin`, it lives
-- here alone, and `prisma migrate diff` neither reports nor drops it.
CREATE INDEX "notification_email_queue" ON "Notification" ("createdAt") WHERE "emailedAt" IS NULL;

-- FR-12.3 (audit H6b): when the weekly digest was last sent to each account.
-- The weekly run skips anyone sent one within WEEKLY_DIGEST_MIN_GAP_DAYS, so a
-- run repeated by hand no longer emails everybody twice.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "weeklyDigestSentAt" TIMESTAMP(3);
