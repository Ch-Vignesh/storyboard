-- FR-13.5, FR-13.7 (phase 14, item 2.7; decision 0045): what moderation
-- upholds can be hidden. A hidden story is not found for anyone but its
-- authors and the moderators; a hidden suggestion or idea reads as removed to
-- everyone but its writer and the moderators, and is no longer an answer.
-- Nothing is deleted, because credit is permanent; "Show it again" undoes it.
-- Additive.

-- AlterTable
ALTER TABLE "Storyboard" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" "ReportCategory";

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" "ReportCategory";

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" "ReportCategory";
