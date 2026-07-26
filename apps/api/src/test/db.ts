import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient();

/** Wipes every table in FK-safe order, for hermetic integration tests. */
export async function resetDb(): Promise<void> {
  await testPrisma.outreachDraft.deleteMany();
  await testPrisma.warmPath.deleteMany();
  await testPrisma.networkContact.deleteMany();
  await testPrisma.notification.deleteMany();
  await testPrisma.webhookEndpoint.deleteMany();
  await testPrisma.lead.deleteMany();
  await testPrisma.search.deleteMany();
  await testPrisma.exclusionEntry.deleteMany();
  await testPrisma.exclusionList.deleteMany();
  await testPrisma.discoveryRun.deleteMany();
  await testPrisma.enrichmentJob.deleteMany();
  await testPrisma.usageEvent.deleteMany();
  await testPrisma.thesisMatchScore.deleteMany();
  await testPrisma.deal.deleteMany();
  await testPrisma.contact.deleteMany();
  await testPrisma.investor.deleteMany();
  await testPrisma.workspaceMember.deleteMany();
  await testPrisma.workspace.deleteMany();
  await testPrisma.session.deleteMany();
  await testPrisma.account.deleteMany();
  await testPrisma.user.deleteMany();
}
