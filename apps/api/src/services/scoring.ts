import type { FitFlag, FitScoreComponent, FitScoreResult } from "@raisely/shared-types";
import type { StructuredQueryValue } from "../schemas/structured-query.js";

/**
 * Fit scoring for search ranking (Phase 2/3).
 *
 * Four of the five components (stage_fit, recent_activity, geography,
 * freshness) are fully deterministic. `thesis_match` is scored two ways:
 *  - `scoreThesisMatchNaive` - a synchronous keyword-overlap heuristic, used
 *    as an instant fallback and by `computeFitScore` for simple/sync callers.
 *  - The real semantic score comes from a batched Claude call cached per
 *    (investor, query_hash) - see services/thesis-match.ts. search-execution
 *    calls `computeDeterministicComponents` + `detectConflictFlags` directly
 *    and substitutes a cached or naive thesis component via `assembleFitScore`.
 */

export interface ScorableDeal {
  id: string;
  company: string;
  sector: string | null;
  stage: string | null;
  date: Date | null;
}

export interface ScorableInvestor {
  id: string;
  thesis: string | null;
  stages: string[];
  sectors: string[];
  geographies: string[];
  checkMin: number | null;
  checkMax: number | null;
  lastFundCloseDate: Date | null;
  deals: ScorableDeal[];
}

const MAX_POINTS = {
  thesisMatch: 35,
  stageFit: 20,
  recentActivity: 25,
  geography: 10,
  freshness: 10,
} as const;

const RECENT_ACTIVITY_WINDOW_MONTHS = 18;
const STALE_DEAL_WINDOW_MONTHS = 24;

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}

function rangesOverlap(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null
): boolean {
  const lo = Math.max(aMin ?? -Infinity, bMin ?? -Infinity);
  const hi = Math.min(aMax ?? Infinity, bMax ?? Infinity);
  return lo <= hi;
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function scoreStageFit(investor: ScorableInvestor, query: StructuredQueryValue): FitScoreComponent {
  const max = MAX_POINTS.stageFit;
  const stagesRequested = query.stages.length > 0;
  const checkRequested = query.checkRange.min != null || query.checkRange.max != null;

  const stageMatch = !stagesRequested || investor.stages.some((s) => query.stages.includes(s));
  const checkMatch =
    !checkRequested ||
    rangesOverlap(investor.checkMin, investor.checkMax, query.checkRange.min, query.checkRange.max);

  const points = (stageMatch ? 12 : 0) + (checkMatch ? 8 : 0);

  const stageLabel = investor.stages.length ? investor.stages.join(", ") : "unspecified stages";
  const checkLabel =
    investor.checkMin != null && investor.checkMax != null
      ? `${formatMoney(investor.checkMin)}-${formatMoney(investor.checkMax)} checks`
      : "no check size on file";

  return {
    factor: "stage_fit",
    points,
    max,
    evidence: `Leads ${stageLabel} rounds, ${checkLabel}`,
  };
}

function scoreGeography(investor: ScorableInvestor, query: StructuredQueryValue): FitScoreComponent {
  const max = MAX_POINTS.geography;

  if (query.geographies.length === 0) {
    return { factor: "geography", points: max, max, evidence: "No geography filter specified" };
  }

  if (investor.geographies.length === 0) {
    return { factor: "geography", points: 0, max, evidence: "No geography data on file" };
  }

  const overlap = investor.geographies.filter((g) => query.geographies.includes(g));
  const fraction = Math.min(1, overlap.length / query.geographies.length);
  const points = Math.round(max * fraction);

  return {
    factor: "geography",
    points,
    max,
    evidence: overlap.length
      ? `Active in ${overlap.join(", ")}`
      : `Active in ${investor.geographies.join(", ")}, no overlap with requested geographies`,
  };
}

/**
 * Combines two dry-powder signals into one component: how recently the fund
 * closed (boost if <24mo) and how recently the investor actually did a deal
 * (decay if the most recent one is >24mo old, or there's no deal history at
 * all) - an investor can have a freshly closed fund but no deployment signal,
 * or vice versa, and both matter.
 */
function scoreFreshness(investor: ScorableInvestor, now: Date): FitScoreComponent {
  const max = MAX_POINTS.freshness;

  let fundScore = 0;
  let fundEvidence = "no fund close date on record";
  if (investor.lastFundCloseDate) {
    const months = monthsBetween(investor.lastFundCloseDate, now);
    if (months <= 12) fundScore = 10;
    else if (months <= 24) fundScore = 6;
    else if (months <= 48) fundScore = 2;
    else fundScore = 0;
    fundEvidence = `Fund closed ${months} month${months === 1 ? "" : "s"} ago`;
  }

  const mostRecentDealDate = investor.deals.reduce<Date | null>((latest, deal) => {
    if (!deal.date) return latest;
    return !latest || deal.date > latest ? deal.date : latest;
  }, null);

  let dealPenalty = 0;
  let dealEvidence: string | null = null;
  if (!mostRecentDealDate) {
    dealPenalty = 2;
    dealEvidence = "no deal history on record";
  } else {
    const monthsSinceDeal = monthsBetween(mostRecentDealDate, now);
    if (monthsSinceDeal > STALE_DEAL_WINDOW_MONTHS) {
      dealPenalty = 4;
      dealEvidence = `last known deal was ${monthsSinceDeal} months ago`;
    }
  }

  const points = Math.max(0, Math.min(max, fundScore - dealPenalty));
  const evidence = dealEvidence ? `${fundEvidence}; ${dealEvidence}` : fundEvidence;

  return { factor: "freshness", points, max, evidence };
}

function scoreRecentActivity(
  investor: ScorableInvestor,
  query: StructuredQueryValue,
  now: Date
): FitScoreComponent {
  const max = MAX_POINTS.recentActivity;

  const relevantDeals = investor.deals.filter((deal) => {
    if (!deal.date) return false;
    if (monthsBetween(deal.date, now) > RECENT_ACTIVITY_WINDOW_MONTHS) return false;
    if (query.sectors.length === 0) return true;
    return deal.sector != null && query.sectors.includes(deal.sector.toLowerCase());
  });

  const points = Math.min(max, relevantDeals.length * 6);
  const sectorLabel = query.sectors.length ? query.sectors.join("/") : "";

  return {
    factor: "recent_activity",
    points,
    max,
    evidence: relevantDeals.length
      ? `${relevantDeals.length} ${sectorLabel ? `${sectorLabel} ` : ""}deal${
          relevantDeals.length === 1 ? "" : "s"
        } in last ${RECENT_ACTIVITY_WINDOW_MONTHS} months`
      : `No matching deals in the last ${RECENT_ACTIVITY_WINDOW_MONTHS} months`,
    dealIds: relevantDeals.map((d) => d.id),
  };
}

/** Synchronous keyword-overlap fallback for thesis_match, used when no
 * cached Claude score is available yet for this (investor, query_hash). */
export function scoreThesisMatchNaive(investor: ScorableInvestor, query: StructuredQueryValue): FitScoreComponent {
  const max = MAX_POINTS.thesisMatch;
  const terms = Array.from(new Set([...query.sectors, ...query.keywords].map((t) => t.toLowerCase()))).filter(
    Boolean
  );

  if (!investor.thesis) {
    return { factor: "thesis_match", points: 0, max, evidence: "No thesis text on record" };
  }
  if (terms.length === 0) {
    return {
      factor: "thesis_match",
      points: 0,
      max,
      evidence: "No sector/keyword signal to match against thesis (semantic scoring pending)",
    };
  }

  const thesisLower = investor.thesis.toLowerCase();
  const matched = terms.filter((t) => thesisLower.includes(t));
  const points = Math.round(max * (matched.length / terms.length));

  return {
    factor: "thesis_match",
    points,
    max,
    evidence: matched.length
      ? `Thesis mentions ${matched.join(", ")}`
      : "Thesis text present but no keyword overlap detected (semantic scoring pending)",
  };
}

/** Compares the founder's named competitors (StructuredQuery.excludeCompetitorsOf)
 * against an investor's portfolio (Deal.company). Deliberately narrow: matching on
 * broad sector overlap alone would flag nearly every good match (backing other
 * companies in your sector is normal, even desirable) and bury the signal that
 * actually matters - the investor already funding someone the founder named. */
export function detectConflictFlags(investor: ScorableInvestor, query: StructuredQueryValue): FitFlag[] {
  const competitorNames = (query.excludeCompetitorsOf ?? [])
    .map((n) => n.toLowerCase().trim())
    .filter(Boolean);
  if (competitorNames.length === 0) return [];

  return investor.deals
    .filter((deal) => competitorNames.includes(deal.company.toLowerCase().trim()))
    .map((deal) => ({
      type: "conflict" as const,
      detail: `Portfolio includes ${deal.company}${deal.sector ? ` (${deal.sector})` : ""}`,
    }));
}

/** The four deterministic, always-synchronous components, in display order
 * (thesis_match is prepended separately by the caller). */
export function computeDeterministicComponents(
  investor: ScorableInvestor,
  query: StructuredQueryValue,
  now: Date
): FitScoreComponent[] {
  return [
    scoreStageFit(investor, query),
    scoreRecentActivity(investor, query, now),
    scoreGeography(investor, query),
    scoreFreshness(investor, now),
  ];
}

export function assembleFitScore(
  thesisComponent: FitScoreComponent,
  deterministicComponents: FitScoreComponent[],
  flags: FitFlag[]
): FitScoreResult {
  const components = [thesisComponent, ...deterministicComponents];
  const score = Math.max(0, Math.min(100, components.reduce((sum, c) => sum + c.points, 0)));
  return { score, components, flags };
}

/** Convenience wrapper for callers that don't need cache-aware thesis
 * scoring (e.g. tests, or any one-off scoring outside the search flow). */
export function computeFitScore(
  investor: ScorableInvestor,
  query: StructuredQueryValue,
  opts: { now?: Date } = {}
): FitScoreResult {
  const now = opts.now ?? new Date();
  const thesisComponent = scoreThesisMatchNaive(investor, query);
  const deterministicComponents = computeDeterministicComponents(investor, query, now);
  const flags = detectConflictFlags(investor, query);
  return assembleFitScore(thesisComponent, deterministicComponents, flags);
}
