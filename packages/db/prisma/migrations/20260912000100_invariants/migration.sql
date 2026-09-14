-- Invariants that Prisma's schema language cannot express.
-- Keep this file in sync with the comments in prisma/schema.prisma.

-- ---------------------------------------------------------------------------
-- NFR-3: Revision rows are append-only.
--
-- UPDATE is always refused. DELETE is refused unless the current transaction
-- has opted in with
--     select set_config('storyboard.hard_delete', 'on', true);
-- which exists for exactly two jobs: hard-deleting a storyboard 30 days after
-- its soft delete (FR-2.6) and deleting an account. Application code never
-- sets it anywhere else.
-- ---------------------------------------------------------------------------
create or replace function revision_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('storyboard.hard_delete', true) = 'on' then
    return old;
  end if;
  -- Default SQLSTATE P0001 on purpose: Prisma passes it through with this
  -- message intact, whereas integrity-class codes are folded into generic errors.
  raise exception 'Revision rows are immutable (NFR-3): % refused', tg_op
    using hint = 'Create a new revision instead. Hard deletes must set storyboard.hard_delete = on for the transaction.';
end
$$;

create trigger revision_no_update
  before update on "Revision"
  for each row execute function revision_immutable();

create trigger revision_no_delete
  before delete on "Revision"
  for each row execute function revision_immutable();

-- ---------------------------------------------------------------------------
-- FR-10.2: exactly one main version per storyboard.
-- ---------------------------------------------------------------------------
create unique index one_main_per_storyboard
  on "Version" ("storyboardId")
  where "isMain" = true;

-- ---------------------------------------------------------------------------
-- FR-5.1: a section has at most one open request at a time.
-- ANSWERED still counts as open from the section's point of view.
-- ---------------------------------------------------------------------------
create unique index one_open_request_per_section
  on "ContributionRequest" ("sectionId")
  where "state" in ('OPEN', 'ANSWERED');
