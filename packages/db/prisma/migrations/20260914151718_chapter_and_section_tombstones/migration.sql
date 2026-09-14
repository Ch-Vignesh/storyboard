-- FR-8.2 / decision 0008: deleting a chapter or a section removes it from the
-- reading order without destroying prose.
--
-- "Nothing in this product hard-deletes prose except storyboard deletion
-- (FR-2.6) and account deletion" — so a structural delete is a tombstone, the
-- same shape as Section.mergedIntoId for FR-2.4, and every Revision underneath
-- stays permanently addressable. The hard-delete escape hatch added in
-- 20260912000100_invariants keeps its two callers and gains no others.

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- Reading order excludes tombstones on every query, so index what is read.
CREATE INDEX "Chapter_versionId_order_live_idx"
  ON "Chapter" ("versionId", "order") WHERE "deletedAt" IS NULL;

CREATE INDEX "Section_chapterId_order_live_idx"
  ON "Section" ("chapterId", "order") WHERE "deletedAt" IS NULL AND "mergedIntoId" IS NULL;
