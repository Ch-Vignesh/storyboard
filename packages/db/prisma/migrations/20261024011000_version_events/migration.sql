-- Phase 14, item 7.10 (FR-10.2): "promotion swaps is_main and records the swap
-- in storyboard history". Until now a promotion wrote only a log line, and the
-- previous main draft kept the name "Main draft", so the reader called an
-- alternate by the main draft's name. A VersionEvent row is written in the
-- promotion's transaction, with both versions' names as they were then. Additive:
-- a new enum type and a new table; nothing existing changes. Earlier promotions
-- left no record, so the history starts empty.

-- CreateEnum
CREATE TYPE "VersionEventKind" AS ENUM ('PROMOTED');

-- CreateTable
CREATE TABLE "VersionEvent" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "kind" "VersionEventKind" NOT NULL,
    "versionId" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "versionName" VARCHAR(120) NOT NULL,
    "previousName" VARCHAR(120),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VersionEvent_storyboardId_createdAt_idx" ON "VersionEvent"("storyboardId", "createdAt");

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "Storyboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

