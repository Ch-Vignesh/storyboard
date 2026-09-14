-- NFR-5 / decision 0009: reading comfort persisted per user, not per browser.
-- Percentages of the manuscript tokens in packages/ui (19px, line height 1.68)
-- so the values stay integers and their bounds live in lib/schemas/constants.ts.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "readingLineHeight" INTEGER NOT NULL DEFAULT 168,
ADD COLUMN     "readingTypeScale" INTEGER NOT NULL DEFAULT 100;
