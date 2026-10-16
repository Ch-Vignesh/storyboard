-- FR-2.7, decision 0039: what is written while a once-public story is private
-- again stays private when it goes public once more. `publicFrom` is stamped
-- once (decision 0007), so that writing used to become readable the moment
-- the story was republished. Additive only, so it can be applied before the
-- code that uses it.

-- CreateTable
CREATE TABLE "PrivateSpan" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PrivateSpan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivateSpan_storyboardId_idx" ON "PrivateSpan"("storyboardId");

-- AddForeignKey
ALTER TABLE "PrivateSpan" ADD CONSTRAINT "PrivateSpan_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "Storyboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A story that was public once and is private now is in a span already, and
-- when it began was never recorded. It is taken to have begun at the first
-- publication: everything since is kept private if the story goes public
-- again, which hides too much rather than too little.
INSERT INTO "PrivateSpan" ("id", "storyboardId", "startedAt")
SELECT 'ps_' || md5(random()::text || "id"), "id", "publicFrom"
FROM "Storyboard"
WHERE "visibility" = 'PRIVATE' AND "publicFrom" IS NOT NULL AND "deletedAt" IS NULL;
