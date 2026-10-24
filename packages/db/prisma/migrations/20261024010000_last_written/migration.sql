-- Phase 14, item 7.6 (FR-11.1, prototype): "last written". When a story's newest
-- revision was written, in any of its versions, so the dashboard's "Stories you
-- are writing" can sort by it and cards can say it. Storyboard.updatedAt moved
-- with settings and never with writing.
--
-- Additive: one nullable column, backfilled from the revisions already written,
-- and kept from then on by a trigger rather than by each of the eleven places
-- that insert a revision (commit, restore, split, join, accept, import, a new
-- chapter or section, a new story, a spin-off's copy), so a twelfth cannot
-- forget it. Revisions are immutable (NFR-3) and only ever inserted, so an
-- insert trigger sees every one. A spin-off's copies keep their original times
-- (decision 0019); the spin-off stamps its own moment when it is made.

-- AlterTable
ALTER TABLE "Storyboard" ADD COLUMN "lastWrittenAt" TIMESTAMP(3);

UPDATE "Storyboard" AS s
SET "lastWrittenAt" = written."latest"
FROM (
  SELECT v."storyboardId", max(r."createdAt") AS "latest"
  FROM "Revision" AS r
  JOIN "Section" AS sec ON sec."id" = r."sectionId"
  JOIN "Chapter" AS c ON c."id" = sec."chapterId"
  JOIN "Version" AS v ON v."id" = c."versionId"
  GROUP BY v."storyboardId"
) AS written
WHERE written."storyboardId" = s."id";

-- Item 7.6 (FR-11.1) — never moves backwards: a copied revision carries an
-- older time than one already written.
CREATE OR REPLACE FUNCTION storyboard_last_written() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Storyboard" AS s
  SET "lastWrittenAt" = greatest(coalesce(s."lastWrittenAt", NEW."createdAt"), NEW."createdAt")
  FROM "Section" AS sec
  JOIN "Chapter" AS c ON c."id" = sec."chapterId"
  JOIN "Version" AS v ON v."id" = c."versionId"
  WHERE sec."id" = NEW."sectionId"
    AND s."id" = v."storyboardId"
    AND (s."lastWrittenAt" IS NULL OR s."lastWrittenAt" < NEW."createdAt");
  RETURN NULL;
END;
$$;

CREATE TRIGGER revision_last_written
  AFTER INSERT ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION storyboard_last_written();
