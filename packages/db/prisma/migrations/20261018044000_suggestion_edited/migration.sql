-- Phase 14, item 6.7 (D-12): a sent suggestion can be changed by its writer
-- until an author opens it; editedAt says when it last was, and is shown
-- wherever the suggestion is. Additive.

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN "editedAt" TIMESTAMP(3);
