import { describe, it, expect } from "vitest";
import { computeFitScore, detectConflictFlags, type ScorableInvestor } from "./scoring.js";
import type { StructuredQueryValue } from "../schemas/structured-query.js";

const NOW = new Date("2026-07-26T00:00:00Z");

function baseQuery(overrides: Partial<StructuredQueryValue> = {}): StructuredQueryValue {
  return {
    stages: ["seed"],
    sectors: ["fintech"],
    geographies: ["UK", "EU"],
    checkRange: { min: 250_000, max: 3_000_000 },
    investorTypes: ["VC"],
    keywords: ["b2b payments"],
    ...overrides,
  };
}

function baseInvestor(overrides: Partial<ScorableInvestor> = {}): ScorableInvestor {
  return {
    id: "inv_1",
    thesis: "We back seed b2b payments and fintech infrastructure companies.",
    stages: ["seed", "series-a"],
    sectors: ["fintech", "b2b saas"],
    geographies: ["UK", "EU"],
    checkMin: 250_000,
    checkMax: 3_000_000,
    lastFundCloseDate: new Date("2025-05-26T00:00:00Z"), // 14 months before NOW
    deals: [
      { id: "d1", company: "PaySplit", sector: "fintech", stage: "seed", date: new Date("2025-06-01") },
      { id: "d2", company: "LedgerFlow", sector: "fintech", stage: "seed", date: new Date("2025-09-01") },
      { id: "d3", company: "InvoiceHQ", sector: "fintech", stage: "seed", date: new Date("2026-01-01") },
    ],
    ...overrides,
  };
}

describe("computeFitScore", () => {
  it("is deterministic: identical inputs always produce identical output", () => {
    const investor = baseInvestor();
    const query = baseQuery();

    const first = computeFitScore(investor, query, { now: NOW });
    const second = computeFitScore(investor, query, { now: NOW });

    expect(second).toEqual(first);
  });

  it("scores a strong match highly with full evidence", () => {
    const result = computeFitScore(baseInvestor(), baseQuery(), { now: NOW });

    expect(result.score).toBeGreaterThan(70);
    expect(result.components).toHaveLength(5);
    expect(result.components.map((c) => c.factor)).toEqual([
      "thesis_match",
      "stage_fit",
      "recent_activity",
      "geography",
      "freshness",
    ]);

    const recentActivity = result.components.find((c) => c.factor === "recent_activity")!;
    expect(recentActivity.points).toBe(18); // 3 deals * 6
    expect(recentActivity.dealIds).toEqual(["d1", "d2", "d3"]);
  });

  it("never exceeds each component's max, and total score is clamped to [0, 100]", () => {
    const investor = baseInvestor({
      deals: Array.from({ length: 20 }, (_, i) => ({
        id: `d${i}`,
        company: `Portco ${i}`,
        sector: "fintech",
        stage: "seed",
        date: new Date("2026-01-01"),
      })),
    });

    const result = computeFitScore(investor, baseQuery(), { now: NOW });

    for (const c of result.components) {
      expect(c.points).toBeLessThanOrEqual(c.max);
      expect(c.points).toBeGreaterThanOrEqual(0);
    }
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("penalizes stale investors via the freshness component", () => {
    const stale = baseInvestor({
      lastFundCloseDate: new Date("2022-01-01"), // >48 months before NOW
      deals: [],
    });

    const result = computeFitScore(stale, baseQuery(), { now: NOW });
    const freshness = result.components.find((c) => c.factor === "freshness")!;
    const recentActivity = result.components.find((c) => c.factor === "recent_activity")!;

    expect(freshness.points).toBe(0);
    expect(recentActivity.points).toBe(0);
  });

  it("does not penalize geography when the query has no geography filter", () => {
    const result = computeFitScore(baseInvestor(), baseQuery({ geographies: [] }), { now: NOW });
    const geography = result.components.find((c) => c.factor === "geography")!;
    expect(geography.points).toBe(geography.max);
  });

  it("scores zero geography when investor has no geography data and query requires one", () => {
    const investor = baseInvestor({ geographies: [] });
    const result = computeFitScore(investor, baseQuery(), { now: NOW });
    const geography = result.components.find((c) => c.factor === "geography")!;
    expect(geography.points).toBe(0);
  });

  it("decays freshness when the fund is fresh but no deal has landed in 24 months", () => {
    const investor = baseInvestor({
      lastFundCloseDate: new Date("2026-06-01"), // 1 month before NOW - fresh fund
      deals: [{ id: "d1", company: "OldCo", sector: "fintech", stage: "seed", date: new Date("2023-01-01") }],
    });

    const result = computeFitScore(investor, baseQuery(), { now: NOW });
    const freshness = result.components.find((c) => c.factor === "freshness")!;

    expect(freshness.points).toBeLessThan(10); // fund-close boost, but penalized for stale deal activity
    expect(freshness.evidence).toContain("last known deal was");
  });

  describe("conflict flags", () => {
    it("returns no flags when the query names no competitors", () => {
      const result = computeFitScore(baseInvestor(), baseQuery(), { now: NOW });
      expect(result.flags).toEqual([]);
    });

    it("does not flag ordinary sector-matching deals as conflicts", () => {
      // baseInvestor's deals are all in the query's sector (fintech) - that's
      // a *positive* recent_activity signal, not a conflict, absent an
      // explicit named competitor.
      const flags = detectConflictFlags(baseInvestor(), baseQuery());
      expect(flags).toEqual([]);
    });

    it("flags a portfolio company that matches an explicitly named competitor", () => {
      const investor = baseInvestor({
        deals: [
          { id: "d1", company: "CompetitorCo", sector: "embedded payments", stage: "seed", date: new Date("2025-01-01") },
          { id: "d2", company: "UnrelatedCo", sector: "fintech", stage: "seed", date: new Date("2025-01-01") },
        ],
      });
      const query = baseQuery({ excludeCompetitorsOf: ["CompetitorCo"] });

      const flags = detectConflictFlags(investor, query);

      expect(flags).toEqual([
        { type: "conflict", detail: "Portfolio includes CompetitorCo (embedded payments)" },
      ]);
    });

    it("matches competitor names case-insensitively", () => {
      const investor = baseInvestor({
        deals: [{ id: "d1", company: "competitorco", sector: "fintech", stage: "seed", date: new Date("2025-01-01") }],
      });
      const flags = detectConflictFlags(investor, baseQuery({ excludeCompetitorsOf: ["CompetitorCo"] }));
      expect(flags).toHaveLength(1);
    });
  });
});
