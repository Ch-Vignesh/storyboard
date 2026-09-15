-- Decision 0013 (OD-3): a contributor may erase their record, and the revision
-- stays. The prose is the author's manuscript once accepted; the name is the
-- contributor's personal data. Erasure separates the two.
--
-- Two halves. First the columns, so authorship can be absent at all. Then the
-- NFR-3 trigger, which until now refused every UPDATE on Revision and would
-- therefore have refused erasure too — and would have blocked account deletion
-- as well, because the foreign keys below are ON DELETE SET NULL and a
-- referential action fires triggers like any other write.

-- DropForeignKey
ALTER TABLE "Credit" DROP CONSTRAINT "Credit_contributorId_fkey";

-- DropForeignKey
ALTER TABLE "Revision" DROP CONSTRAINT "Revision_authorId_fkey";

-- AlterTable
ALTER TABLE "Credit" ADD COLUMN     "erasedAt" TIMESTAMP(3),
ALTER COLUMN "contributorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Revision" ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- NFR-3, amended for decision 0013.
--
-- UPDATE is still refused, with one exception: unnaming. A transaction that has
-- opted in with
--     select set_config('storyboard.erase_authorship', 'on', true);
-- may clear "authorId" and "acceptedById" and change nothing else. Every other
-- column is pinned by the conditions below, including contentHash — so an
-- erasure cannot be used as cover for altering the timestamped proof of
-- authorship that FR-13.6 promises.
--
-- Authorship may only be *cleared*. Setting it to a different person, or back
-- again, is refused: erasure is one-way (decision 0013).
-- ---------------------------------------------------------------------------
create or replace function revision_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('storyboard.hard_delete', true) = 'on' then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and current_setting('storyboard.erase_authorship', true) = 'on'
     -- Authorship may only be cleared, never set or reassigned.
     and (new."authorId" is null or new."authorId" is not distinct from old."authorId")
     and (new."acceptedById" is null or new."acceptedById" is not distinct from old."acceptedById")
     -- And nothing else may move.
     and new."id"             is not distinct from old."id"
     and new."sectionId"      is not distinct from old."sectionId"
     and new."parentId"       is not distinct from old."parentId"
     and new."contentJson"::text is not distinct from old."contentJson"::text
     and new."contentText"    is not distinct from old."contentText"
     and new."wordCount"      is not distinct from old."wordCount"
     and new."contentHash"    is not distinct from old."contentHash"
     and new."source"         is not distinct from old."source"
     and new."suggestionId"   is not distinct from old."suggestionId"
     and new."restoredFromId" is not distinct from old."restoredFromId"
     and new."createdAt"      is not distinct from old."createdAt"
  then
    return new;
  end if;

  -- Default SQLSTATE P0001 on purpose: Prisma passes it through with this
  -- message intact, whereas integrity-class codes are folded into generic errors.
  raise exception 'Revision rows are immutable (NFR-3): % refused', tg_op
    using hint = 'Create a new revision instead. Hard deletes must set storyboard.hard_delete = on; unnaming a contributor must set storyboard.erase_authorship = on and may change nothing else.';
end
$$;
