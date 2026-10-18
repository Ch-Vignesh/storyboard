-- FR-5.9 with FR-6.9 (phase 14, item 1.12): "help me think" requests move
-- through their states on ideas as prose requests do on suggestions. Ideas
-- never moved a request, so every one stayed "open" however many ideas it
-- had, and the idea that helped never resolved it. Existing requests take the
-- state their ideas give them. An idea answer is a top-level idea from
-- somebody who is not the story's owner or an accepted co-author. Data only;
-- nothing structural.

UPDATE "ContributionRequest" AS r
SET "state" = 'ANSWERED'
WHERE r."kind" = 'UNBLOCK'
  AND r."state" = 'OPEN'
  AND EXISTS (
    SELECT 1
    FROM "Idea" AS i
    JOIN "Storyboard" AS s ON s."id" = r."storyboardId"
    WHERE i."requestId" = r."id"
      AND i."parentId" IS NULL
      AND i."authorId" <> s."ownerId"
      AND NOT EXISTS (
        SELECT 1
        FROM "Collaborator" AS c
        WHERE c."storyboardId" = s."id"
          AND c."userId" = i."authorId"
          AND c."acceptedAt" IS NOT NULL
      )
  );

-- Resolved by the idea marked as having helped (decision 0010: one per
-- request), at the time its credit was written.
UPDATE "ContributionRequest" AS r
SET "state" = 'RESOLVED',
    "resolvedAt" = COALESCE(r."resolvedAt", cr."createdAt", NOW())
FROM "Idea" AS i
LEFT JOIN "Credit" AS cr ON cr."ideaId" = i."id"
WHERE i."requestId" = r."id"
  AND i."markedHelpful" = true
  AND r."kind" = 'UNBLOCK'
  AND r."state" IN ('OPEN', 'ANSWERED');
