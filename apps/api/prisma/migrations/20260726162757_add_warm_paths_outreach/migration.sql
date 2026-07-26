-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'GOOGLE_IMPORT';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "companyOneLiner" TEXT;

-- CreateTable
CREATE TABLE "network_contacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'LINKEDIN_IMPORT',
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_drafts" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "firstLine" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_contacts_workspaceId_idx" ON "network_contacts"("workspaceId");

-- CreateIndex
CREATE INDEX "network_contacts_email_idx" ON "network_contacts"("email");

-- CreateIndex
CREATE INDEX "network_contacts_linkedinUrl_idx" ON "network_contacts"("linkedinUrl");

-- CreateIndex
CREATE INDEX "outreach_drafts_leadId_idx" ON "outreach_drafts"("leadId");

-- AddForeignKey
ALTER TABLE "network_contacts" ADD CONSTRAINT "network_contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
