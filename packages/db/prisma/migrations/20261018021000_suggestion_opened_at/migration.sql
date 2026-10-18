-- FR-6.5 (phase 14, item 1.10): when an author first opened a suggestion.
-- Withdrawal "notifies the author only if the author had already opened it",
-- and nothing recorded an opening, so it could not be done. Set once, when an
-- owner or co-author loads the suggestion's comparison page. Additive only, so
-- it can be applied before the code that uses it.

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "openedAt" TIMESTAMP(3);
