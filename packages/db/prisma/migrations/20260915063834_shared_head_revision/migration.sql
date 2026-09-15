-- Architecture §2.2 / decision 0014: a section copied into a new version points
-- at the SAME revision as the section it was copied from. Revisions are
-- immutable and shared, never copied, which is what makes a section history
-- cross version boundaries (§2.3) and what makes creating a version cheap.
--
-- The unique index dropped here made that impossible: it allowed one section
-- per revision, so the second version could not record a head at all. It was a
-- consequence of modelling the head as a one-to-one relation, and the relation
-- is one-to-many.

-- DropIndex
DROP INDEX "Section_currentRevisionId_key";
