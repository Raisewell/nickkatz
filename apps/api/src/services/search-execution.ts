import type { PrismaClient, Prisma, LeadTier } from "@prisma/client";
import type { FitScoreResult } from "@raisely/shared-types";
import type { StructuredQueryValue } from "../schemas/structured-query.js";
import {
  assembleFitScore,
  computeDeterministicComponents,
  detectConflictFlags,
  scoreThesisMatchNaive,
  type ScorableInvestor,
} from "./scoring.js";
import { toThesisComponent } from "./thesis-match.js";
import { computeExcludedInvestorIds } from "./exclusion-filter.js";
import { computeThesisQueryHash } from "../lib/query-hash.js";
import { enqueueThesisMatchBatches } from "../jobs/thesis-match-queue.js";
import { withTimeout } from "../lib/with-timeout.js";

const ENQUEUE_TIMEOUT_MS = 2000;

const CANDIDATE_LIMIT = 500;

export interface InvestorSummary {
  id: string;
  name: string;
  type: string;
  thesis: string | null;
  sectors: string[];
  stages: string[];
  geographies: string[];
  checkMin: number | null;
  checkMax: number | null;
  website: string | null;
  linkedinUrl: string | null;
}

export interface LeadResult {
  id: string;
  investorId: string;
  investor: InvestorSummary;
  fitScore: number;
  fitReasons: FitScoreResult;
  tier: LeadTier | null;
  pipelineStage: string;
  tags: string[];
}

export interface RunSearchParams {
  workspaceId: string;
  createdById: string;
  name?: string;
  queryText?: string;
  structuredQuery: StructuredQueryValue;
  saved?: boolean;
  savedSearchId?: string;
  /** When set, skips SQL filtering by structuredQuery and scores exactly
   * these investors instead - used to merge lookalike-discovery candidates
   * into a Search result set (structuredQuery is still used for scoring
   * context, e.g. sectors inferred from the comparable companies). */
  investorIdsOverride?: string[];
  page?: number;
  pageSize?: number;
}

export interface RunSearchResult {
  search: {
    id: string;
    name: string | null;
    queryText: string | null;
    structuredQuery: StructuredQueryValue;
    status: string;
    saved: boolean;
    excludedCount: number;
    createdAt: Date;
  };
  results: LeadResult[];
  pagination: { page: number; pageSize: number; total: number };
  excludedCount: number;
}

function buildInvestorWhere(query: StructuredQueryValue): Prisma.InvestorWhereInput {
  const AND: Prisma.InvestorWhereInput[] = [];

  if (query.investorTypes.length) AND.push({ type: { in: query.investorTypes } });
  if (query.stages.length) AND.push({ stages: { hasSome: query.stages } });
  if (query.sectors.length) AND.push({ sectors: { hasSome: query.sectors } });
  if (query.geographies.length) AND.push({ geographies: { hasSome: query.geographies } });

  if (query.checkRange.min != null) {
    AND.push({ OR: [{ checkMax: null }, { checkMax: { gte: query.checkRange.min } }] });
  }
  if (query.checkRange.max != null) {
    AND.push({ OR: [{ checkMin: null }, { checkMin: { lte: query.checkRange.max } }] });
  }

  if (query.keywords.length) {
    AND.push({
      OR: query.keywords.flatMap((kw) => [
        { thesis: { contains: kw, mode: "insensitive" as const } },
        { name: { contains: kw, mode: "insensitive" as const } },
      ]),
    });
  }

  return AND.length ? { AND } : {};
}

function toInvestorSummary(investor: {
  id: string;
  name: string;
  type: string;
  thesis: string | null;
  sectors: string[];
  stages: string[];
  geographies: string[];
  checkMin: number | null;
  checkMax: number | null;
  website: string | null;
  linkedinUrl: string | null;
}): InvestorSummary {
  return {
    id: investor.id,
    name: investor.name,
    type: investor.type,
    thesis: investor.thesis,
    sectors: investor.sectors,
    stages: investor.stages,
    geographies: investor.geographies,
    checkMin: investor.checkMin,
    checkMax: investor.checkMax,
    website: investor.website,
    linkedinUrl: investor.linkedinUrl,
  };
}

/**
 * Filters investors against a structured query in SQL, excludes anything on
 * the workspace's exclusion lists, ranks the remainder with the fit-scoring
 * engine, persists a Search + one Lead per surviving candidate, and returns
 * a page of results. Used by both the free-text search flow and Firm Finder
 * (which just omits `queryText`), and by saved-search re-runs.
 */
export async function runSearch(prisma: PrismaClient, params: RunSearchParams): Promise<RunSearchResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.InvestorWhereInput = params.investorIdsOverride
    ? { id: { in: params.investorIdsOverride } }
    : buildInvestorWhere(params.structuredQuery);

  const candidates = await prisma.investor.findMany({
    where,
    take: CANDIDATE_LIMIT,
    include: {
      deals: { select: { id: true, company: true, sector: true, stage: true, date: true } },
    },
  });

  const { excludedInvestorIds, excludedCount } = await computeExcludedInvestorIds(
    prisma,
    params.workspaceId,
    candidates.map((c) => c.id)
  );

  const included = candidates.filter((c) => !excludedInvestorIds.has(c.id));

  // thesis_match: use a cached Claude semantic score when we have one for
  // this (investor, query_hash); otherwise fall back to the naive
  // keyword-overlap heuristic immediately and queue a batched background
  // job so the real score is cached by the time this query is run again.
  const queryHash = computeThesisQueryHash(params.structuredQuery.sectors, params.structuredQuery.keywords);
  const cachedThesisScores = await prisma.thesisMatchScore.findMany({
    where: { queryHash, investorId: { in: included.map((c) => c.id) } },
  });
  const thesisCacheByInvestorId = new Map(cachedThesisScores.map((row) => [row.investorId, row]));

  const now = new Date();
  const uncachedInvestorIds: string[] = [];

  const scored = included
    .map((investor) => {
      const scorable: ScorableInvestor = {
        id: investor.id,
        thesis: investor.thesis,
        stages: investor.stages,
        sectors: investor.sectors,
        geographies: investor.geographies,
        checkMin: investor.checkMin,
        checkMax: investor.checkMax,
        lastFundCloseDate: investor.lastFundCloseDate,
        deals: investor.deals,
      };

      const cacheHit = thesisCacheByInvestorId.get(investor.id);
      let thesisComponent;
      if (cacheHit) {
        thesisComponent = toThesisComponent(cacheHit);
      } else {
        thesisComponent = scoreThesisMatchNaive(scorable, params.structuredQuery);
        uncachedInvestorIds.push(investor.id);
      }

      const deterministicComponents = computeDeterministicComponents(scorable, params.structuredQuery, now);
      const flags = detectConflictFlags(scorable, params.structuredQuery);
      const fitReasons = assembleFitScore(thesisComponent, deterministicComponents, flags);

      return { investor, fitReasons };
    })
    .sort((a, b) => b.fitReasons.score - a.fitReasons.score);

  if (uncachedInvestorIds.length > 0) {
    try {
      await withTimeout(
        enqueueThesisMatchBatches(
          queryHash,
          { sectors: params.structuredQuery.sectors, keywords: params.structuredQuery.keywords },
          uncachedInvestorIds
        ),
        ENQUEUE_TIMEOUT_MS,
        "enqueueThesisMatchBatches"
      );
    } catch (err) {
      // Best-effort: if Redis is unreachable or slow, the search still
      // returns naive-fallback scores and simply won't benefit from a cache
      // warm-up this time around. Logged (not swallowed silently) so a
      // persistent failure here is actually visible.
      console.error("Failed to enqueue thesis-match batch job:", err);
    }
  }

  const search = await prisma.search.create({
    data: {
      workspaceId: params.workspaceId,
      createdById: params.createdById,
      name: params.name,
      queryText: params.queryText,
      structuredQuery: params.structuredQuery as unknown as Prisma.InputJsonValue,
      status: "COMPLETE",
      saved: params.saved ?? false,
      savedSearchId: params.savedSearchId,
      excludedCount,
    },
  });

  const leads =
    scored.length > 0
      ? await prisma.lead.createManyAndReturn({
          data: scored.map(({ investor, fitReasons }) => ({
            workspaceId: params.workspaceId,
            searchId: search.id,
            investorId: investor.id,
            fitScore: fitReasons.score,
            fitReasons: fitReasons as unknown as Prisma.InputJsonValue,
            pipelineStage: "IDENTIFIED" as const,
          })),
        })
      : [];

  const leadByInvestorId = new Map(leads.map((l) => [l.investorId, l]));

  const pageStart = (page - 1) * pageSize;
  const pageItems = scored.slice(pageStart, pageStart + pageSize);

  const results: LeadResult[] = pageItems.map(({ investor, fitReasons }) => {
    const lead = leadByInvestorId.get(investor.id)!;
    return {
      id: lead.id,
      investorId: investor.id,
      investor: toInvestorSummary(investor),
      fitScore: lead.fitScore ?? fitReasons.score,
      fitReasons,
      tier: lead.tier,
      pipelineStage: lead.pipelineStage,
      tags: lead.tags,
    };
  });

  return {
    search: {
      id: search.id,
      name: search.name,
      queryText: search.queryText,
      structuredQuery: params.structuredQuery,
      status: search.status,
      saved: search.saved,
      excludedCount: search.excludedCount,
      createdAt: search.createdAt,
    },
    results,
    pagination: { page, pageSize, total: scored.length },
    excludedCount,
  };
}
