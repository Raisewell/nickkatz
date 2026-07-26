import {
  extractTextBlock,
  getAnthropicClient,
  getAnthropicModel,
  stripMarkdownFences,
  withRetry,
} from "../lib/anthropic.js";
import { structuredQuerySchema, type StructuredQueryValue } from "../schemas/structured-query.js";

const SYSTEM_PROMPT = `You parse a founder's free-text fundraising description into a structured search query for Raisely, an investor discovery platform.

Respond with ONLY a single JSON object, no prose, no markdown code fences. The JSON must match this shape exactly:

{
  "stages": string[],            // e.g. ["seed"], ["series-a"], normalized to lowercase, hyphenated (pre-seed, seed, series-a, series-b, growth)
  "sectors": string[],           // normalized lowercase sector/vertical keywords, e.g. "fintech", "b2b saas", "healthtech"
  "geographies": string[],       // normalized region/country names, e.g. "US", "UK", "EU", "LatAm", "APAC"
  "checkRange": { "min": number | null, "max": number | null },  // target check size in USD, both nullable
  "investorTypes": ("VC" | "ANGEL" | "FAMILY_OFFICE" | "CVC" | "STRATEGIC")[],
  "keywords": string[],          // any other distinguishing free-text keywords not captured above
  "excludeCompetitorsOf": string[]  // company names the user wants to avoid investors who back competitors of, if mentioned
}

Omit fields you have no signal for by returning an empty array or null - never fabricate values. Only include "excludeCompetitorsOf" if the text mentions competitor avoidance.`;

export interface RefineQueryResult {
  query: StructuredQueryValue;
  usedFallback: boolean;
  error?: string;
}

/** Best-effort structured query when Claude is unavailable or returns something
 * we can't validate. Keeps the free-text as keywords so the search isn't empty. */
export function fallbackStructuredQuery(text: string): StructuredQueryValue {
  const keywords = Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+]+/i)
        .filter((word) => word.length > 3)
    )
  ).slice(0, 8);

  return {
    stages: [],
    sectors: [],
    geographies: [],
    checkRange: { min: null, max: null },
    investorTypes: [],
    keywords,
  };
}

export async function refineQuery(text: string): Promise<RefineQueryResult> {
  const client = getAnthropicClient();
  if (!client) {
    return { query: fallbackStructuredQuery(text), usedFallback: true, error: "ANTHROPIC_API_KEY not configured" };
  }

  try {
    const query = await withRetry(async () => {
      const message = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      });

      const raw = extractTextBlock(message);
      const cleaned = stripMarkdownFences(raw);
      const parsed: unknown = JSON.parse(cleaned);
      return structuredQuerySchema.parse(parsed);
    });

    return { query, usedFallback: false };
  } catch (err) {
    return {
      query: fallbackStructuredQuery(text),
      usedFallback: true,
      error: err instanceof Error ? err.message : "Unknown error refining query",
    };
  }
}
