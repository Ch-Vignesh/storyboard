-- Phase 14, item 3.15 (screen 16): what a new story starts as, chosen once in
-- settings and read by the create form and the import. Public by default, as
-- the create form has always been. Additive.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';
