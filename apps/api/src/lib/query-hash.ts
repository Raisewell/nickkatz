import { createHash } from "node:crypto";

/**
 * Stable hash of the parts of a StructuredQuery that actually affect
 * thesis_match semantic scoring (sectors + keywords). Stage/geography/check
 * range don't change what "does this thesis match" means, so two searches
 * that only differ in those still share a cache entry.
 */
export function computeThesisQueryHash(sectors: string[], keywords: string[]): string {
  const normalized = {
    sectors: [...sectors].map((s) => s.toLowerCase().trim()).filter(Boolean).sort(),
    keywords: [...keywords].map((k) => k.toLowerCase().trim()).filter(Boolean).sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
