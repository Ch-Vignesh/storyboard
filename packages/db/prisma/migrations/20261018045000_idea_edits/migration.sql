-- Phase 14, item 6.8 (FR-6.9; D-7): an idea can be changed by its writer for
-- a while (editedAt says it was) and removed by its writer (deletedAt; it then
-- reads "Removed by its writer" and its replies stay). Additive.

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);
