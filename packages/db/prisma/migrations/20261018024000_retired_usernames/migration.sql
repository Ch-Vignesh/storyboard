-- FR-1.3 with decisions 0011 and 0024, as decision 0042 (phase 14, item 1.6):
-- a deleted account's username stays retired. The purge set it to null and
-- the username step checked only current accounts, so a stranger could take
-- a name still printed in credit lines and exported front matter. The table
-- holds the SHA-256 of the lower-cased name, not the name. Additive only.

-- CreateTable
CREATE TABLE "RetiredUsername" (
    "hash" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredUsername_pkey" PRIMARY KEY ("hash")
);
