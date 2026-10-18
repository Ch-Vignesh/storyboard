-- Phase 14, item 3.13 (D-5): a profile picture. Whatever is uploaded is cut
-- to a centred square and shrunk to an icon (AVATAR.sizePx a side, WebP)
-- before it is stored, so a row is a few kilobytes and no object store is
-- needed. Served from /u/[username]/avatar with updatedAt as the version in
-- the URL. User.avatarUrl stays, unused. Additive.

-- CreateTable
CREATE TABLE "UserAvatar" (
    "userId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "contentType" VARCHAR(40) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
