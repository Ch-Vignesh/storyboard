-- FR-6.9 with OD-5 resolved as "one per request" (decision 0010).
--
-- An author may mark exactly one idea on a request as having helped, and that
-- mark is what creates a Credit. Enforced here rather than only in the router,
-- for the same reason as the other invariants in this schema: two tabs, or two
-- co-authors, can both pass an application-level check at the same instant and
-- only the database can refuse the second write.
--
-- Prisma cannot express a partial unique index, so it lives in raw SQL beside
-- one_main_per_storyboard and one_open_request_per_section.
CREATE UNIQUE INDEX one_helpful_idea_per_request
  ON "Idea" ("requestId")
  WHERE "markedHelpful" = true;
