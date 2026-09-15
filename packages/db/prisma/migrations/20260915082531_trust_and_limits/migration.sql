-- Phase 6 (FR-13, FR-15.5).
--
-- User.suspendedAt / suspendedById: FR-13.5. Suspension freezes the person and
-- leaves the work where it is (decision 0018), so nothing here touches
-- Storyboard or Credit.
--
-- User.rulesSeenAt: FR-13.4, the community rules shown once at sign-up.
--
-- RateLimitHit: FR-13.3 counted in Postgres rather than Redis (decision 0017).
-- Indexed on (key, at) because every read is a count over one key and window;
-- rows past the longest window are pruned by the cron runner.
--
-- FeatureFlag: FR-15.5, a switch the owner can throw without a deploy.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rulesSeenAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedById" TEXT;

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(300) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitHit_key_at_idx" ON "RateLimitHit"("key", "at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
