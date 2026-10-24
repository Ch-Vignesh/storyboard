-- Phase 14, item 10.2 (NFR-7): the socially significant events, stored as
-- well as logged: accept, pass, restore, spin-off, report, promotion, every
-- administrator's decision (decision 0043), and an account deletion asked for,
-- cancelled or done. Who did it, whom it was about, on which story, to what,
-- and a little JSON of ids and settled values: never anybody's words. Plain
-- ids, no foreign keys, so a row outlives the story it names. Pruned daily
-- after AUDIT_LOG.retentionDays. Additive: a new table nothing else refers
-- to, so it can be applied before the code that writes it.

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "actorId" TEXT,
    "subjectId" TEXT,
    "storyboardId" TEXT,
    "targetType" VARCHAR(32),
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectId_createdAt_idx" ON "AuditEvent"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_storyboardId_createdAt_idx" ON "AuditEvent"("storyboardId", "createdAt");
