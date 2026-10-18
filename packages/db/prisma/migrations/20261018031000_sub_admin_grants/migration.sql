-- Decision 0043 (phase 14, item 2b.3): what the admin has let a sub-admin do.
-- One row per capability. The names live in apps/app/src/lib/authz/admin.ts
-- and are checked against that list before they are written; the database
-- keeps the pair unique and takes the rows with the account. Additive.

-- CreateTable
CREATE TABLE "SubAdminGrant" (
    "userId" TEXT NOT NULL,
    "capability" VARCHAR(40) NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubAdminGrant_pkey" PRIMARY KEY ("userId","capability")
);

-- AddForeignKey
ALTER TABLE "SubAdminGrant" ADD CONSTRAINT "SubAdminGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubAdminGrant" ADD CONSTRAINT "SubAdminGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
