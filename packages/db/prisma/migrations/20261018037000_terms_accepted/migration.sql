-- Phase 14, item 2.3: when the account was created, which is when the person
-- agreed to the terms and the privacy policy, as the button beside the form
-- said. Null for an account made before this landed. The community rules are
-- now read, and recorded as read, on the last onboarding step (FR-13.4).
-- Additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);
