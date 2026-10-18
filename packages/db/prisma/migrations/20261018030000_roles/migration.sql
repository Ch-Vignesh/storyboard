-- Decision 0043 (phase 14, item 2b.1): roles. `isAdmin` was a flag set by hand
-- in the database. `role` replaces it: USER, SUB_ADMIN or ADMIN, with exactly
-- one ADMIN. `isAdmin` stays this phase and is read nowhere; it goes in a
-- later, non-additive phase. Additive only, so it can be applied before the
-- code that uses it.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUB_ADMIN', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- Every account that held the flag keeps a door: the earliest becomes the
-- admin, any other a sub-admin (with no grants until the admin gives them), so
-- the one-admin rule below can hold whatever the flag's history was.
UPDATE "User" SET "role" = 'SUB_ADMIN' WHERE "isAdmin" = true;
UPDATE "User" SET "role" = 'ADMIN'
WHERE "id" = (
  SELECT "id" FROM "User" WHERE "isAdmin" = true ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
);

-- Exactly one administrator (decision 0043), as `one_main_per_storyboard`
-- keeps one main draft (decision 0003): a second ADMIN row is refused by the
-- database, whatever the application forgets.
CREATE UNIQUE INDEX "one_admin" ON "User" ("role") WHERE "role" = 'ADMIN';
