-- Phase 14, item 10.1 (NFR-7, D-10): server faults that no code handled, kept
-- in the database so they outlive the host's brief logs, and so the hourly job
-- can email the administrators when a new kind appears. Where, what kind, the
-- message cut short and the top of the stack: no request bodies, no writing,
-- no person. Pruned daily after SERVER_ERRORS.retentionDays. Additive: a new
-- table nothing else refers to, so it can be applied before the code that
-- writes it.

-- CreateTable
CREATE TABLE "ServerError" (
    "id" TEXT NOT NULL,
    "fingerprint" VARCHAR(32) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "stack" VARCHAR(2000),
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerError_fingerprint_createdAt_idx" ON "ServerError"("fingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "ServerError_createdAt_idx" ON "ServerError"("createdAt");
