-- Phase 14, item 3.16: which ways into an account exist, so settings can show
-- them and "Disconnect Google" can mean something. googleLinkedAt is when
-- Google first signed the account in; googleDisconnectedAt refuses Google for
-- the address until the person allows it again. Additive.
--
-- Backfill: an account with a confirmed address and no password can only have
-- come from Google (the email route sets the password in the step that
-- confirms the address), so it is marked as linked from its creation. An
-- account with a password that also used Google is not knowable from here and
-- is marked the next time Google signs it in.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleLinkedAt" TIMESTAMP(3),
ADD COLUMN "googleDisconnectedAt" TIMESTAMP(3);

UPDATE "User"
SET "googleLinkedAt" = "createdAt"
WHERE "passwordHash" IS NULL
  AND "emailVerifiedAt" IS NOT NULL
  AND "status" <> 'DELETED';
