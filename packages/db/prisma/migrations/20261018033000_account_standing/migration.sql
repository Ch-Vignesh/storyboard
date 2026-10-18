-- Decision 0043 (phase 14, item 2b.5): a ban is a suspension that neither the
-- report review nor "Lift the suspension" undoes, and that stops the person
-- cancelling a deletion an administrator started. The note is why the account
-- stands as it does, for administrators' eyes only. Additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "standingNote" VARCHAR(500);
