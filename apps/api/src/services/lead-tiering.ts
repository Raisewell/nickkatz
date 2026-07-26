import type { PrismaClient } from "@prisma/client";

const A_PERCENTILE = 0.2;
const B_PERCENTILE = 0.5;

export interface TierSearchLeadsResult {
  tiered: number;
  thresholds: { a: number; b: number };
}

/**
 * Auto-tiers a search's leads by fit-score percentile: top 20% -> A, next
 * 30% (through the 50th percentile) -> B, the rest -> C. Leads without a
 * fit score are left untouched (nothing to rank them by).
 */
export async function tierSearchLeads(prisma: PrismaClient, searchId: string): Promise<TierSearchLeadsResult> {
  const leads = await prisma.lead.findMany({
    where: { searchId, fitScore: { not: null } },
    select: { id: true, fitScore: true },
  });

  if (leads.length === 0) {
    return { tiered: 0, thresholds: { a: 0, b: 0 } };
  }

  const sorted = [...leads].sort((a, b) => b.fitScore! - a.fitScore!);
  const aCutoffIndex = Math.max(1, Math.ceil(sorted.length * A_PERCENTILE));
  const bCutoffIndex = Math.max(aCutoffIndex, Math.ceil(sorted.length * B_PERCENTILE));

  await prisma.$transaction(
    sorted.map((lead, i) => {
      const tier = i < aCutoffIndex ? "A" : i < bCutoffIndex ? "B" : "C";
      return prisma.lead.update({ where: { id: lead.id }, data: { tier } });
    })
  );

  return {
    tiered: sorted.length,
    thresholds: {
      a: sorted[Math.min(aCutoffIndex, sorted.length) - 1].fitScore!,
      b: sorted[Math.min(bCutoffIndex, sorted.length) - 1].fitScore!,
    },
  };
}
