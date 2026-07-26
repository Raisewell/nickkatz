import type { PrismaClient } from "@prisma/client";

export interface ExclusionResult {
  excludedInvestorIds: Set<string>;
  excludedCount: number;
}

function normalizeLinkedInUrl(url: string): string {
  return url.toLowerCase().trim().replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Given a workspace's exclusion lists and a set of candidate investor ids,
 * returns which of those investors should be hidden from search results -
 * either because the investor firm itself was excluded, or because one of
 * its contacts matches an excluded person (email, LinkedIn URL, or name).
 */
export async function computeExcludedInvestorIds(
  prisma: PrismaClient,
  workspaceId: string,
  candidateInvestorIds: string[]
): Promise<ExclusionResult> {
  if (candidateInvestorIds.length === 0) {
    return { excludedInvestorIds: new Set(), excludedCount: 0 };
  }

  const entries = await prisma.exclusionEntry.findMany({
    where: { exclusionList: { workspaceId } },
    select: { name: true, email: true, linkedinUrl: true },
  });

  if (entries.length === 0) {
    return { excludedInvestorIds: new Set(), excludedCount: 0 };
  }

  const excludedEmails = new Set(
    entries.filter((e) => e.email).map((e) => e.email!.toLowerCase().trim())
  );
  const excludedLinkedin = new Set(
    entries.filter((e) => e.linkedinUrl).map((e) => normalizeLinkedInUrl(e.linkedinUrl!))
  );
  const excludedNames = new Set(entries.filter((e) => e.name).map((e) => normalizeName(e.name!)));

  const investors = await prisma.investor.findMany({
    where: { id: { in: candidateInvestorIds } },
    select: {
      id: true,
      name: true,
      linkedinUrl: true,
      contacts: { select: { email: true, linkedinUrl: true, name: true } },
    },
  });

  const excludedInvestorIds = new Set<string>();

  for (const investor of investors) {
    const investorLinkedinMatch = investor.linkedinUrl
      ? excludedLinkedin.has(normalizeLinkedInUrl(investor.linkedinUrl))
      : false;
    const investorNameMatch = excludedNames.has(normalizeName(investor.name));

    const contactMatch = investor.contacts.some((c) => {
      const emailMatch = c.email ? excludedEmails.has(c.email.toLowerCase().trim()) : false;
      const linkedinMatch = c.linkedinUrl ? excludedLinkedin.has(normalizeLinkedInUrl(c.linkedinUrl)) : false;
      const nameMatch = c.name ? excludedNames.has(normalizeName(c.name)) : false;
      return emailMatch || linkedinMatch || nameMatch;
    });

    if (investorLinkedinMatch || investorNameMatch || contactMatch) {
      excludedInvestorIds.add(investor.id);
    }
  }

  return { excludedInvestorIds, excludedCount: excludedInvestorIds.size };
}
