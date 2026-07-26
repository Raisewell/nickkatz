import type { FitFlag, FitScoreComponent, FitScoreResult } from "@raisely/shared-types";
import type { StructuredQueryValue } from "../schemas/structured-query.js";

/**
 * Deterministic + naive-keyword fit scoring for Phase 2/3 search ranking.
 *
 * `thesis_match` here is a keyword-overlap heuristic. Phase 3 replaces it with
 * a Claude-backed semantic score cached per (investor, query_hash) via a
 * background job - the component shape (factor/points/max/evidence) is
 * designed to be a drop-in replacement so callers don't change.
 *
 * Conflict flags (Phase 3 conflict detection against the founder's own
 * company sector/keywords) are intentionally left empty for now; this
 * function's `flags` output is the extension point.
 */

export interface ScorableDeal {
  id: string;
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

function scoreFreshness(investor: ScorableInvestor, now: Date): FitScoreComponent {
  const max = MAX_POINTS.freshness;

  if (!investor.lastFundCloseDate) {
    return { factor: "freshness", points: 0, max, evidence: "No fund close date on record" };
  }

  const months = monthsBetween(investor.lastFundCloseDate, now);
  let points: number;
  if (months <= 12) points = 10;
  else if (months <= 24) points = 6;
  else if (months <= 48) points = 2;
  else points = 0;

  return {
    factor: "freshness",
    points,
    max,
    evidence: `Fund closed ${months} month${months === 1 ? "" : "s"} ago`,
  };
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

function scoreThesisMatchNaive(investor: ScorableInvestor, query: StructuredQueryValue): FitScoreComponent {
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

export function computeFitScore(
  investor: ScorableInvestor,
  query: StructuredQueryValue,
  opts: { now?: Date } = {}
): FitScoreResult {
  const now = opts.now ?? new Date();

  const components: FitScoreComponent[] = [
    scoreThesisMatchNaive(investor, query),
    scoreStageFit(investor, query),
    scoreRecentActivity(investor, query, now),
    scoreGeography(investor, query),
    scoreFreshness(investor, now),
  ];

  const score = Math.max(
    0,
    Math.min(100, components.reduce((sum, c) => sum + c.points, 0))
  );

  const flags: FitFlag[] = [];

  return { score, components, flags };
}
