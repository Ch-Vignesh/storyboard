-- Decision 0043 (phase 14, item 2b.6): a username can be banned before anyone
-- takes it. A banned name is kept in clear with its note, so the Names screen
-- can list it; a name retired with a deleted account stays a hash alone
-- (decision 0042). Additive.

-- CreateEnum
CREATE TYPE "RetiredReason" AS ENUM ('RETIRED', 'BANNED');

-- AlterTable
ALTER TABLE "RetiredUsername" ADD COLUMN     "reason" "RetiredReason" NOT NULL DEFAULT 'RETIRED',
ADD COLUMN     "name" TEXT,
ADD COLUMN     "note" VARCHAR(500);
