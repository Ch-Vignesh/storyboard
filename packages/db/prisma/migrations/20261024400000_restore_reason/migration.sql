-- Phase 14, item 8.14 (FR-8.6): an optional reason on a restore, one of the
-- four chips FR-6.10 offers on a pass. Written when the restoring revision is
-- inserted, which the NFR-3 trigger has always allowed, and never after.
-- Additive: existing revisions have no reason, which is what they had.

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN "restoreReason" "PassChip";

-- ---------------------------------------------------------------------------
-- NFR-3, kept whole for the new column.
--
-- The trigger refuses every UPDATE but one: unnaming a contributor (decision
-- 0013), which may clear "authorId" and "acceptedById" and must change
-- nothing else. It pins the other columns by name, so a column it does not
-- name could be changed under that exception. "restoreReason" is pinned
-- here with the rest; the function is otherwise as migration
-- 20260915063522_erasable_contribution_record left it.
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
     and new."restoreReason"  is not distinct from old."restoreReason"
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
