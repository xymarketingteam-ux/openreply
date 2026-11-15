-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "postIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: a campaign bound to one post covers exactly that post.
UPDATE "Automation" SET "postIds" = ARRAY["postId"] WHERE "postId" IS NOT NULL;
