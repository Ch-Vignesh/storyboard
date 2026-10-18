-- Phase 14, items 6.1 and 6.2: a request can be changed by its authors while
-- it is open (editedAt says when), and character notes have their own column
-- instead of sharing the tone notes. Additive.

-- AlterTable
ALTER TABLE "ContributionRequest" ADD COLUMN "characterNotes" TEXT,
ADD COLUMN "editedAt" TIMESTAMP(3);
