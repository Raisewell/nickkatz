import { PILLAR_FIELDS, type CallRecord } from "./schema.js";

/** call_id convention (see extraction prompt): {company}_{investor_firm_short}_{YYYYMMDD} */
export function deriveCompany(record: CallRecord): string {
  return record.call_id.split("_")[0] ?? record.call_id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sortByDate(records: CallRecord[]): CallRecord[] {
  return [...records].sort((a, b) => a.date.localeCompare(b.date));
}

/** Largest subset of records that all fall within `windowDays` of the earliest member. */
function largestWindowCluster(records: CallRecord[], windowDays: number): CallRecord[] {
  const sorted = sortByDate(records);
  let best: CallRecord[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const windowEnd = new Date(sorted[i].date).getTime() + windowDays * DAY_MS;
    const cluster = sorted.slice(i).filter((r) => new Date(r.date).getTime() <= windowEnd);
    if (cluster.length > best.length) best = cluster;
  }
  return best;
}

/** From the manual's Appendix C decision rules. */
export const PATTERN_THRESHOLDS = {
  /** "if the same objection category appears in three or more calls for the same company within two weeks" */
  sameCompanyRecurrence: 3,
  tightWindowDays: 14,
  /** "5+ similar objections from related investor types before calling it a market-wide pattern" */
  crossCompanyRecurrence: 5,
  /** "at least two evidence-supported call records plus a clear operator review" */
  highConfidenceApprovedCount: 2,
} as const;

export interface ObjectionCluster {
  objection_category: string;
  company?: string; // absent for cross-company clusters
  records: CallRecord[];
  count: number;
  investorFirms: string[];
  meanInterestLevel: number;
  /** Meets the manual's same-company pattern threshold (3+ total for this company). */
  isPattern: boolean;
  /** Meets the threshold AND all qualifying calls fall inside one 14-day window. */
  isTightWindowPattern: boolean;
  tightWindowSize: number;
  /** 2+ of the cluster's records are `approved` with real (non "not_discussed") evidence. */
  isHighConfidence: boolean;
}

function realEvidenceCount(r: CallRecord): number {
  return [r.evidence_snippet_1, r.evidence_snippet_2].filter((s) => s !== "not_discussed").length;
}

function buildCluster(category: string, records: CallRecord[], company?: string): ObjectionCluster {
  const tightWindow = largestWindowCluster(records, PATTERN_THRESHOLDS.tightWindowDays);
  const approvedWithEvidence = records.filter((r) => r.status === "approved" && realEvidenceCount(r) > 0);
  const threshold = company ? PATTERN_THRESHOLDS.sameCompanyRecurrence : PATTERN_THRESHOLDS.crossCompanyRecurrence;

  return {
    objection_category: category,
    company,
    records,
    count: records.length,
    investorFirms: Array.from(new Set(records.map((r) => r.investor_firm))),
    meanInterestLevel: mean(records.map((r) => r.interest_level)),
    isPattern: records.length >= threshold,
    isTightWindowPattern: tightWindow.length >= threshold,
    tightWindowSize: tightWindow.length,
    isHighConfidence: approvedWithEvidence.length >= PATTERN_THRESHOLDS.highConfidenceApprovedCount,
  };
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Real objections only — a "not_discussed" top_objection carries no signal about what's blocking the round. */
function withRealObjection(records: CallRecord[]): CallRecord[] {
  return records.filter((r) => r.top_objection !== "not_discussed");
}

/** Objection clustering within a single company (manual section 14.2 + Appendix C). */
export function clusterObjectionsForCompany(records: CallRecord[]): ObjectionCluster[] {
  const byCategory = new Map<string, CallRecord[]>();
  for (const r of withRealObjection(records)) {
    const list = byCategory.get(r.objection_category) ?? [];
    list.push(r);
    byCategory.set(r.objection_category, list);
  }
  const company = records[0] ? deriveCompany(records[0]) : undefined;
  return Array.from(byCategory.entries())
    .map(([category, recs]) => buildCluster(category, recs, company))
    .sort((a, b) => b.count - a.count);
}

/** Objection clustering across every company in the dataset (manual: "market-wide signal"). */
export function clusterObjectionsAcrossCompanies(records: CallRecord[]): ObjectionCluster[] {
  const byCategory = new Map<string, CallRecord[]>();
  for (const r of withRealObjection(records)) {
    const list = byCategory.get(r.objection_category) ?? [];
    list.push(r);
    byCategory.set(r.objection_category, list);
  }
  return Array.from(byCategory.entries())
    .map(([category, recs]) => {
      const cluster = buildCluster(category, recs);
      const distinctCompanies = new Set(recs.map(deriveCompany));
      return { ...cluster, isPattern: recs.length >= PATTERN_THRESHOLDS.crossCompanyRecurrence && distinctCompanies.size >= 2 };
    })
    .sort((a, b) => b.count - a.count);
}

export interface PillarAverage {
  pillar: string;
  average: number;
}

/** Five-pillar averages (manual section 9) so the weakest pillar is visible without reading every row. */
export function pillarAverages(records: CallRecord[]): PillarAverage[] {
  return PILLAR_FIELDS.map((pillar) => ({
    pillar,
    average: mean(records.map((r) => r[pillar])),
  })).sort((a, b) => a.average - b.average);
}

export interface CompanyBrief {
  company: string;
  callCount: number;
  dateRange: { first: string; last: string };
  objectionClusters: ObjectionCluster[];
  pillarAverages: PillarAverage[];
  /** interest_level is high but the top (unresolved) objection cluster keeps recurring — "trust gap" per operating guide. */
  interestVsResolutionGap: boolean;
}

export function buildCompanyBrief(records: CallRecord[]): CompanyBrief {
  const sorted = sortByDate(records);
  const company = records[0] ? deriveCompany(records[0]) : "unknown";
  const clusters = clusterObjectionsForCompany(records);
  const top = clusters[0];
  const avgInterest = mean(records.map((r) => r.interest_level));

  return {
    company,
    callCount: records.length,
    dateRange: { first: sorted[0]?.date ?? "", last: sorted[sorted.length - 1]?.date ?? "" },
    objectionClusters: clusters,
    pillarAverages: pillarAverages(records),
    interestVsResolutionGap: Boolean(top && top.isPattern && avgInterest >= 3.5),
  };
}

function fmtFirms(firms: string[]): string {
  return firms.length > 3 ? `${firms.slice(0, 3).join(", ")}, +${firms.length - 3} more` : firms.join(", ");
}

export function renderCompanyBriefMarkdown(brief: CompanyBrief): string {
  const lines: string[] = [];
  lines.push(`# ${brief.company} — Investor Intelligence Brief (auto-generated)`);
  lines.push(
    `*RAISE FIS pattern scan — ${brief.callCount} call${brief.callCount === 1 ? "" : "s"} analyzed (${brief.dateRange.first} to ${brief.dateRange.last})*`
  );
  lines.push("");

  const top = brief.objectionClusters[0];
  lines.push("## Headline");
  if (!top) {
    lines.push("No objections with real content were extracted yet — not enough data for a pattern read.");
  } else {
    const patternNote = top.isPattern
      ? `meets the pattern threshold (${top.count} calls, threshold is ${PATTERN_THRESHOLDS.sameCompanyRecurrence}+)`
      : `below the pattern threshold so far (${top.count} call${top.count === 1 ? "" : "s"}, threshold is ${PATTERN_THRESHOLDS.sameCompanyRecurrence}+)`;
    lines.push(
      `**\`${top.objection_category}\`** is the most recurring objection category: ${patternNote}${
        top.isTightWindowPattern ? `, including ${top.tightWindowSize} within a single ${PATTERN_THRESHOLDS.tightWindowDays}-day window` : ""
      }. Investors involved: ${fmtFirms(top.investorFirms)}. Mean interest level on these calls: ${top.meanInterestLevel}/5.${
        top.isHighConfidence ? " This is a high-confidence insight (2+ approved, evidence-backed records)." : ""
      }`
    );
    if (brief.interestVsResolutionGap) {
      lines.push("");
      lines.push(
        `**Trust gap:** interest is consistently at or above ${top.meanInterestLevel}/5 while this objection keeps recurring unresolved — per the operating guide, high interest without progressing next steps signals a trust gap, not a story problem.`
      );
    }
  }
  lines.push("");

  lines.push("## Objection clusters");
  lines.push("| Category | Count | Pattern? | Investors | Mean interest |");
  lines.push("|---|---|---|---|---|");
  for (const c of brief.objectionClusters) {
    lines.push(`| ${c.objection_category} | ${c.count} | ${c.isPattern ? "yes" : "no"} | ${fmtFirms(c.investorFirms)} | ${c.meanInterestLevel}/5 |`);
  }
  lines.push("");

  lines.push("## Five-pillar averages (weakest first)");
  lines.push("| Pillar | Average |");
  lines.push("|---|---|");
  for (const p of brief.pillarAverages) {
    lines.push(`| ${p.pillar} | ${p.average}/5 |`);
  }
  lines.push("");

  if (top) {
    const improvements = Array.from(
      new Set(top.records.map((r) => r.suggested_improvement).filter((s) => s && s !== "not_discussed"))
    );
    if (improvements.length > 0) {
      lines.push(`## Suggested improvements already on record (for the \`${top.objection_category}\` cluster)`);
      for (const imp of improvements) {
        lines.push(`- ${imp}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export interface CrossCompanyBrief {
  companyCount: number;
  callCount: number;
  clusters: ObjectionCluster[];
}

export function buildCrossCompanyBrief(records: CallRecord[]): CrossCompanyBrief {
  return {
    companyCount: new Set(records.map(deriveCompany)).size,
    callCount: records.length,
    clusters: clusterObjectionsAcrossCompanies(records),
  };
}

export function renderCrossCompanyBriefMarkdown(brief: CrossCompanyBrief): string {
  const lines: string[] = [];
  lines.push("# Cross-company Investor Intelligence Brief (auto-generated)");
  lines.push(`*RAISE FIS pattern scan — ${brief.callCount} calls across ${brief.companyCount} companies*`);
  lines.push("");
  lines.push("## Objection clusters across all companies");
  lines.push("| Category | Count | Companies | Market-wide pattern? |");
  lines.push("|---|---|---|---|");
  for (const c of brief.clusters) {
    const companies = new Set(c.records.map(deriveCompany));
    lines.push(`| ${c.objection_category} | ${c.count} | ${Array.from(companies).join(", ")} | ${c.isPattern ? "yes" : "no"} |`);
  }
  lines.push("");
  const marketWide = brief.clusters.filter((c) => c.isPattern);
  if (marketWide.length > 0) {
    lines.push(
      `**Market-wide signal:** ${marketWide.map((c) => `\`${c.objection_category}\` (${c.count} calls, ${new Set(c.records.map(deriveCompany)).size} companies)`).join("; ")} — meets the ${PATTERN_THRESHOLDS.crossCompanyRecurrence}+ across-company threshold from Appendix C.`
    );
  } else {
    lines.push("No category yet meets the cross-company market-wide threshold.");
  }
  return lines.join("\n");
}
