-- FR-9.4 — suggestions that were passed on appear on the writer's profile in a
-- separate, collapsed section, visible only to them unless they choose
-- otherwise. The default is false on purpose: "defaulting these to public
-- would make passing feel punitive", and FR-6.10 goes to some trouble to make
-- a pass read as information rather than a verdict.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showPassedWork" BOOLEAN NOT NULL DEFAULT false;
