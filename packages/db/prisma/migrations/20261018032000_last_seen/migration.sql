-- Decision 0043 (phase 14, item 2b.4): when an account was last here, to the
-- hour. Written by the session read at most once an hour, by plain SQL so that
-- "updatedAt" keeps meaning a change to the account. Null until the account's
-- first request after this lands. Additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
