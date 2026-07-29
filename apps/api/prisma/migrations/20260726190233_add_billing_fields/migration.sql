-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus";

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_stripeCustomerId_key" ON "workspaces"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_stripeSubscriptionId_key" ON "workspaces"("stripeSubscriptionId");

