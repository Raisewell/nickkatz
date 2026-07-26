-- AlterTable: add workspaceId as nullable first so this works against
-- tables that already have rows, then backfill from the parent relation
-- before enforcing NOT NULL.
ALTER TABLE "exclusion_entries" ADD COLUMN     "workspaceId" TEXT;
ALTER TABLE "outreach_drafts" ADD COLUMN     "workspaceId" TEXT;

UPDATE "exclusion_entries" ee
SET "workspaceId" = el."workspaceId"
FROM "exclusion_lists" el
WHERE ee."exclusionListId" = el."id";

UPDATE "outreach_drafts" od
SET "workspaceId" = l."workspaceId"
FROM "leads" l
WHERE od."leadId" = l."id";

ALTER TABLE "exclusion_entries" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "outreach_drafts" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateTable
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestIp" TEXT,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppressions_email_idx" ON "suppressions"("email");

-- CreateIndex
CREATE INDEX "suppressions_linkedinUrl_idx" ON "suppressions"("linkedinUrl");

-- CreateIndex
CREATE INDEX "exclusion_entries_workspaceId_idx" ON "exclusion_entries"("workspaceId");

-- CreateIndex
CREATE INDEX "outreach_drafts_workspaceId_idx" ON "outreach_drafts"("workspaceId");

-- AddForeignKey
ALTER TABLE "exclusion_entries" ADD CONSTRAINT "exclusion_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
