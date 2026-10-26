-- FR-12.3 (the 2026-10-26 final pass, the detective review): a failed send was
-- never counted or given up. Being the oldest, it led the queue on every run,
-- and three such rows in a row stopped every immediate and hourly run for good.
-- The runs now count failures here, take the fewest first, and give a row up
-- after EMAIL_SEND_ATTEMPTS. Additive, with a default, so it can be applied
-- before the code that uses it.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailAttempts" INTEGER NOT NULL DEFAULT 0;
