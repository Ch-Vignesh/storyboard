-- Phase 14, item 6.15 (FR-11.3, D-8, decision 0050): a request closes by itself
-- REQUEST_OPEN_DAYS after it was opened, or last opened again. openedAt is that
-- clock, reset when an author opens a closed request again; createdAt stays
-- what it was. Additive; backfilled from createdAt, so a request already open
-- longer than that closes on the first nightly run after this is applied.

-- AlterTable
ALTER TABLE "ContributionRequest" ADD COLUMN "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ContributionRequest" SET "openedAt" = "createdAt";
