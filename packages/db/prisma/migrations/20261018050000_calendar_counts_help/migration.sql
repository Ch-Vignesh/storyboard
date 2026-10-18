-- Phase 14, item 6.13 (FR-9.3, D-6, decision 0049): the contribution calendar
-- counts help given on other people's stories, and nothing else. Every row is
-- rebuilt from the records: one count per person per day of suggestions sent
-- and top-level ideas posted on stories they do not write (not the owner, not
-- an accepted co-author, as things stand now). Saves, requests opened and
-- decisions no longer count. The days are UTC days, as the old rows were: the
-- zone a thing was sent from was not recorded before this item. Data only; no
-- schema change.

DELETE FROM "ActivityDay";

INSERT INTO "ActivityDay" ("userId", "day", "count")
SELECT help."userId", help."day", COUNT(*)::int
FROM (
  SELECT s."contributorId" AS "userId", s."submittedAt"::date AS "day"
  FROM "Suggestion" s
  JOIN "ContributionRequest" r ON r."id" = s."requestId"
  JOIN "Storyboard" b ON b."id" = r."storyboardId"
  WHERE s."submittedAt" IS NOT NULL
    AND s."contributorId" <> b."ownerId"
    AND NOT EXISTS (
      SELECT 1 FROM "Collaborator" c
      WHERE c."storyboardId" = b."id"
        AND c."userId" = s."contributorId"
        AND c."acceptedAt" IS NOT NULL
    )
  UNION ALL
  SELECT i."authorId" AS "userId", i."createdAt"::date AS "day"
  FROM "Idea" i
  JOIN "ContributionRequest" r ON r."id" = i."requestId"
  JOIN "Storyboard" b ON b."id" = r."storyboardId"
  WHERE i."parentId" IS NULL
    AND i."authorId" <> b."ownerId"
    AND NOT EXISTS (
      SELECT 1 FROM "Collaborator" c
      WHERE c."storyboardId" = b."id"
        AND c."userId" = i."authorId"
        AND c."acceptedAt" IS NOT NULL
    )
) AS help
GROUP BY help."userId", help."day";
