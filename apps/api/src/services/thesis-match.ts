import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { FitScoreComponent } from "@raisely/shared-types";
import {
  extractTextBlock,
  getAnthropicClient,
  getAnthropicModel,
  stripMarkdownFences,
  withRetry,
} from "../lib/anthropic.js";

const MAX_THESIS_POINTS = 35;

const SYSTEM_PROMPT = `You score how well each investor's stated thesis matches a founder's fundraising search.

You will receive the founder's search sectors/keywords and a list of investors with their thesis text. For every investor id given, respond with a 0-100 confidence score (100 = the thesis is an extremely strong, specific match; 0 = no relevant signal at all) and a short evidence string (<=140 characters) citing the specific thesis language that drove the score, or explaining why there's no match.

Respond with ONLY a single JSON object, no prose, no markdown code fences, matching this shape exactly, with exactly one entry per investor id given, in the same order:

{ "results": [ { "investorId": string, "score": number, "evidence": string } ] }`;

const batchResponseSchema = z.object({
  results: z.array(
    z.object({
      investorId: z.string(),
      score: z.number().min(0).max(100),
      evidence: z.string().min(1),
    })
  ),
});

export interface ThesisBatchInvestor {
  id: string;
  thesis: string | null;
}

export interface ThesisQueryContext {
  sectors: string[];
  keywords: string[];
}

/**
 * Scores a batch of investors' thesis text against the founder's search
 * context in a single Claude call, then upserts the results into the
 * ThesisMatchScore cache keyed by (investorId, queryHash).
 *
 * This never throws and never blocks a search response - it's invoked from
 * a background job (see jobs/thesis-match-worker.ts). If Claude is
 * unavailable or returns something we can't validate, it's a no-op: the
 * cache stays empty and callers keep using the naive keyword-overlap
 * fallback until a future job succeeds.
 */
export async function scoreThesisMatchBatch(
  prisma: PrismaClient,
  investors: ThesisBatchInvestor[],
  query: ThesisQueryContext,
  queryHash: string
): Promise<void> {
  if (investors.length === 0) return;

  const client = getAnthropicClient();
  if (!client) return;

  const context = `Founder's search: sectors=[${query.sectors.join(", ") || "none"}], keywords=[${
    query.keywords.join(", ") || "none"
  }]`;
  const investorList = investors.map((inv) => ({ id: inv.id, thesis: inv.thesis ?? "(no thesis on file)" }));

  try {
    const parsed = await withRetry(async () => {
      const message = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${context}\n\nInvestors:\n${JSON.stringify(investorList)}` }],
      });

      const cleaned = stripMarkdownFences(extractTextBlock(message));
      return batchResponseSchema.parse(JSON.parse(cleaned));
    });

    const knownIds = new Set(investors.map((i) => i.id));
    const now = new Date();

    await prisma.$transaction(
      parsed.results
        .filter((r) => knownIds.has(r.investorId))
        .map((r) =>
          prisma.thesisMatchScore.upsert({
            where: { investorId_queryHash: { investorId: r.investorId, queryHash } },
            create: { investorId: r.investorId, queryHash, score: r.score, evidence: r.evidence, computedAt: now },
            update: { score: r.score, evidence: r.evidence, computedAt: now },
          })
        )
    );
  } catch {
    // Fall back gracefully: leave the cache untouched. The next batch job
    // for this query hash will retry from scratch.
  }
}

/** Converts a cached (0-100 confidence) row into the 0-35 point component
 * shape used everywhere else in the fit-score result. */
export function toThesisComponent(cacheHit: { score: number; evidence: string }): FitScoreComponent {
  const points = Math.round((MAX_THESIS_POINTS * cacheHit.score) / 100);
  return { factor: "thesis_match", points, max: MAX_THESIS_POINTS, evidence: cacheHit.evidence };
}
