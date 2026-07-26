import type { PrismaClient } from "@prisma/client";
import type { DiscoveryCandidate, DiscoveryPreview } from "@raisely/shared-types";

const MAX_CANDIDATES = 50;
const DIRECT_MATCH_SCORE = 100;

function normalizeCompany(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Lookalike discovery, in two hops over the Deal table:
 *  1. Direct matches - investors who have a deal in one of the founder's
 *     named comparable companies.
 *  2. Co-investment graph expansion - investors who don't have a deal in a
 *     comparable company itself, but share a portfolio company with a
 *     direct match (i.e. they've co-invested with one of them before).
 * Scored and deduped (a direct match is never also listed as a
 * co-investment candidate), sorted by score, capped to MAX_CANDIDATES.
 */
export async function findLookalikeCandidates(
  prisma: PrismaClient,
  comparableCompanies: string[]
): Promise<DiscoveryPreview> {
  const targets = new Set(comparableCompanies.map(normalizeCompany));

  const allDeals = await prisma.deal.findMany({
    select: { investorId: true, company: true, sector: true },
  });

  const directInvestorIds = new Set<string>();
  const directMatchedCompanies = new Map<string, Set<string>>();
  const inferredSectors = new Set<string>();

  for (const deal of allDeals) {
    if (targets.has(normalizeCompany(deal.company))) {
      directInvestorIds.add(deal.investorId);
      const set = directMatchedCompanies.get(deal.investorId) ?? new Set<string>();
      set.add(deal.company);
      directMatchedCompanies.set(deal.investorId, set);
      if (deal.sector) inferredSectors.add(deal.sector.toLowerCase());
    }
  }

  const directPortfolioCompanies = new Set<string>();
  for (const deal of allDeals) {
    if (directInvestorIds.has(deal.investorId)) {
      directPortfolioCompanies.add(normalizeCompany(deal.company));
    }
  }

  const coInvestCompanies = new Map<string, Set<string>>();
  for (const deal of allDeals) {
    if (directInvestorIds.has(deal.investorId)) continue;
    if (directPortfolioCompanies.has(normalizeCompany(deal.company))) {
      const set = coInvestCompanies.get(deal.investorId) ?? new Set<string>();
      set.add(deal.company);
      coInvestCompanies.set(deal.investorId, set);
    }
  }

  const candidateInvestorIds = new Set([...directInvestorIds, ...coInvestCompanies.keys()]);
  const investors = await prisma.investor.findMany({
    where: { id: { in: [...candidateInvestorIds] } },
    select: { id: true, name: true },
  });
  const investorNameById = new Map(investors.map((i) => [i.id, i.name]));

  const candidates: DiscoveryCandidate[] = [];

  for (const investorId of directInvestorIds) {
    const matched = [...(directMatchedCompanies.get(investorId) ?? [])];
    candidates.push({
      investorId,
      investorName: investorNameById.get(investorId) ?? "Unknown investor",
      matchType: "direct",
      score: DIRECT_MATCH_SCORE,
      reason: `Invested directly in ${matched.join(", ")}`,
      matchedCompanies: matched,
    });
  }

  for (const [investorId, companies] of coInvestCompanies) {
    const matched = [...companies];
    const score = Math.min(90, 40 + matched.length * 15);
    candidates.push({
      investorId,
      investorName: investorNameById.get(investorId) ?? "Unknown investor",
      matchType: "co_investment",
      score,
      reason: `Co-invested in ${matched.length} compan${matched.length === 1 ? "y" : "ies"} alongside direct matches (${matched.join(", ")})`,
      matchedCompanies: matched,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates: candidates.slice(0, MAX_CANDIDATES),
    inferredSectors: [...inferredSectors],
    generatedAt: new Date().toISOString(),
  };
}
