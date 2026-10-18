-- Phase 14, item 3.3: "Sign out on every device". A session that signed in
-- before this instant is refused, as one from before a password reset is
-- (decision 0036). Additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsEndedAt" TIMESTAMP(3);
