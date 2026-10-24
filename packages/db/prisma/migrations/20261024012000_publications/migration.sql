-- Phase 14, item 7b.1 (decision 0044): publishing. A published edition is a
-- frozen copy of a story's main draft — a new Version with frozenAt set, sharing
-- the draft's revisions as every version does (decision 0014) — recorded by a
-- numbered Publication. Every write refuses a frozen version in lib/authz/guard.ts.
-- The newest publication is the current edition; there is no unpublishing, so it
-- is derived rather than stored. Additive: one nullable column and one new table.

-- AlterTable
ALTER TABLE "Version" ADD COLUMN     "frozenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "versionId" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(280),

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_versionId_key" ON "Publication"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_storyboardId_number_key" ON "Publication"("storyboardId", "number");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "Storyboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

