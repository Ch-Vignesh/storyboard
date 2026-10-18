-- FR-10.1 (phase 14, item 1.1): an alternate version that was removed is
-- marked so. Removing one tombstoned the chapters and sections under it and
-- left the version row untouched, so the removed version stayed listed as
-- "0 chapters", was still offered in Compare, and could still be made the
-- main draft, which left a story with no chapters at all and closed every
-- open request on the way. Additive only, so it can be applied before the
-- code that uses it.

-- AlterTable
ALTER TABLE "Version" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- Versions already removed this way: an alternate whose every chapter is
-- tombstoned. A version's last chapter cannot be removed by hand (removing a
-- chapter keeps one), so only removing the version produces that state, and
-- the latest chapter tombstone is when it happened. A main draft is left
-- alone: one with no live chapter is the bug's victim, repaired by promoting
-- its previous main back, not by marking it removed.
UPDATE "Version" AS v
SET "deletedAt" = gone."latest"
FROM (
  SELECT c."versionId", MAX(c."deletedAt") AS "latest"
  FROM "Chapter" AS c
  GROUP BY c."versionId"
  HAVING COUNT(*) FILTER (WHERE c."deletedAt" IS NULL) = 0
) AS gone
WHERE v."id" = gone."versionId" AND v."isMain" = false AND v."deletedAt" IS NULL;
