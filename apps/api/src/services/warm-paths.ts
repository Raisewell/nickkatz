import type { PrismaClient } from "@prisma/client";
import { monthsBetween } from "../lib/dates.js";

/**
 * Warm-path strength from connection recency. We can only honestly compute
 * *direct* paths this way - the founder's own NetworkContact matching an
 * investor Contact means the founder already knows that person. A true
 * "mutual" (2nd-degree) path would require the target contact's own
 * connection graph, which we don't have access to; those are captured via
 * manual entry instead (see createManualWarmPath).
 */
const RECENCY_SCORE_TIERS: { maxMonths: number; score: number }[] = [
  { maxMonths: 12, score: 90 },
  { maxMonths: 24, score: 75 },
  { maxMonths: 36, score: 55 },
  { maxMonths: Infinity, score: 35 },
];

function scoreFromRecency(connectedAt: Date | null, now: Date): { score: number | null; verified: boolean } {
  if (!connectedAt) return { score: null, verified: false };
  const months = monthsBetween(connectedAt, now);
  const tier = RECENCY_SCORE_TIERS.find((t) => months <= t.maxMonths)!;
  return { score: tier.score, verified: true };
}

function normalizeLinkedInUrl(url: string): string {
  return url.toLowerCase().trim().replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

/**
 * Matches the workspace's imported NetworkContacts directly against a
 * lead's investor contacts (by email or LinkedIn URL) and upserts a
 * WarmPath for each hit. Safe to re-run (e.g. after a fresh contacts
 * import) - re-matches update the existing WarmPath rather than
 * duplicating it.
 */
export async function computeWarmPathsForLead(
  prisma: PrismaClient,
  params: { workspaceId: string; leadId: string }
): Promise<number> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: params.leadId },
    include: { investor: { include: { contacts: true } } },
  });

  const networkContacts = await prisma.networkContact.findMany({ where: { workspaceId: params.workspaceId } });
  if (networkContacts.length === 0) return 0;

  const byEmail = new Map(networkContacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const byLinkedIn = new Map(
    networkContacts.filter((c) => c.linkedinUrl).map((c) => [normalizeLinkedInUrl(c.linkedinUrl!), c])
  );

  const now = new Date();
  let created = 0;

  for (const contact of lead.investor.contacts) {
    const match =
      (contact.email && byEmail.get(contact.email.toLowerCase())) ||
      (contact.linkedinUrl && byLinkedIn.get(normalizeLinkedInUrl(contact.linkedinUrl)));
    if (!match) continue;

    const { score, verified } = scoreFromRecency(match.connectedAt, now);

    await prisma.warmPath.upsert({
      where: { leadId_targetContactId: { leadId: params.leadId, targetContactId: contact.id } },
      create: {
        workspaceId: params.workspaceId,
        leadId: params.leadId,
        targetContactId: contact.id,
        mutualName: "Direct connection (imported contacts)",
        strengthScore: score,
        verified,
      },
      update: {
        mutualName: "Direct connection (imported contacts)",
        strengthScore: score,
        verified,
      },
    });
    created += 1;
  }

  return created;
}

export interface CreateManualWarmPathParams {
  workspaceId: string;
  leadId?: string;
  targetContactId: string;
  mutualName: string;
  strengthScore?: number;
}

/** A user-entered "I know someone who knows this contact" path - never
 * computed, always attributed to a human's own knowledge of their network. */
export async function createManualWarmPath(prisma: PrismaClient, params: CreateManualWarmPathParams) {
  return prisma.warmPath.create({
    data: {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      targetContactId: params.targetContactId,
      mutualName: params.mutualName,
      strengthScore: params.strengthScore ?? null,
      verified: false,
    },
  });
}

export async function getBestWarmPathsForLeads(prisma: PrismaClient, leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, Awaited<ReturnType<typeof prisma.warmPath.findMany>>[number]>();

  const warmPaths = await prisma.warmPath.findMany({
    where: { leadId: { in: leadIds } },
    include: { targetContact: true },
    orderBy: [{ strengthScore: "desc" }, { createdAt: "desc" }],
  });

  const best = new Map<string, (typeof warmPaths)[number]>();
  for (const wp of warmPaths) {
    if (!wp.leadId) continue;
    if (!best.has(wp.leadId)) best.set(wp.leadId, wp);
  }
  return best;
}
