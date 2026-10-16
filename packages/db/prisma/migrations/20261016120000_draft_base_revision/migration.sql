-- FR-4.4, FR-4.5 (2026-10-16 spec review): a draft records the revision it
-- was written on. A draft was judged out of date by comparing its time with
-- the head's, so one saved after a "changed a moment ago" refusal looked
-- current, opened over the other person's text, and replaced it on the next
-- save. Additive only, so it can be applied before the code that uses it.

-- AlterTable
ALTER TABLE "SectionDraft" ADD COLUMN     "baseRevisionId" TEXT;

-- The drafts that exist keep the judgement they had: one saved at or after
-- its section's head was written on that head; the rest, left null, now
-- differ from the head and so are still shown as overtaken.
UPDATE "SectionDraft" AS d
SET "baseRevisionId" = s."currentRevisionId"
FROM "Section" AS s
JOIN "Revision" AS r ON r."id" = s."currentRevisionId"
WHERE d."sectionId" = s."id" AND d."updatedAt" >= r."createdAt";
