import { describe, it, expect } from "vitest";
import { findLookalikeCandidates } from "./discovery-matching.js";

interface FakeDeal {
  investorId: string;
  company: string;
  sector: string | null;
}

function fakePrisma(deals: FakeDeal[], investors: { id: string; name: string }[]) {
  return {
    deal: { findMany: async () => deals },
    investor: { findMany: async () => investors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("findLookalikeCandidates", () => {
  it("finds direct matches from the comparable companies", async () => {
    const prisma = fakePrisma(
      [
        { investorId: "inv_a", company: "Stripe", sector: "fintech" },
        { investorId: "inv_b", company: "SomeOtherCo", sector: "healthtech" },
      ],
      [
        { id: "inv_a", name: "Stripe Backer Capital" },
        { id: "inv_b", name: "Unrelated Ventures" },
      ]
    );

    const preview = await findLookalikeCandidates(prisma, ["Stripe"]);

    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0]).toMatchObject({
      investorId: "inv_a",
      matchType: "direct",
      score: 100,
    });
    expect(preview.inferredSectors).toEqual(["fintech"]);
  });

  it("expands via the co-investment graph without duplicating direct matches", async () => {
    const prisma = fakePrisma(
      [
        // inv_a is a direct match (invested in Stripe)
        { investorId: "inv_a", company: "Stripe", sector: "fintech" },
        // inv_a also backed Ramp - a shared portfolio company
        { investorId: "inv_a", company: "Ramp", sector: "fintech" },
        // inv_b co-invested with inv_a in Ramp, but not directly in Stripe
        { investorId: "inv_b", company: "Ramp", sector: "fintech" },
        // inv_c has nothing to do with either
        { investorId: "inv_c", company: "RandomCo", sector: "gaming" },
      ],
      [
        { id: "inv_a", name: "Direct Match Capital" },
        { id: "inv_b", name: "Co-Investor Ventures" },
        { id: "inv_c", name: "Unrelated Fund" },
      ]
    );

    const preview = await findLookalikeCandidates(prisma, ["Stripe"]);

    const byId = new Map(preview.candidates.map((c) => [c.investorId, c]));
    expect(byId.get("inv_a")).toMatchObject({ matchType: "direct", score: 100 });
    expect(byId.get("inv_b")).toMatchObject({ matchType: "co_investment" });
    expect(byId.has("inv_c")).toBe(false);

    // inv_a should appear exactly once (as direct, never duplicated as co-investment)
    expect(preview.candidates.filter((c) => c.investorId === "inv_a")).toHaveLength(1);
  });

  it("scores more shared portfolio companies higher, capped below a direct match", async () => {
    const prisma = fakePrisma(
      [
        { investorId: "inv_a", company: "Stripe", sector: "fintech" },
        { investorId: "inv_a", company: "Ramp", sector: "fintech" },
        { investorId: "inv_a", company: "Brex", sector: "fintech" },
        { investorId: "inv_b", company: "Ramp", sector: "fintech" },
        { investorId: "inv_b", company: "Brex", sector: "fintech" },
        { investorId: "inv_c", company: "Ramp", sector: "fintech" },
      ],
      [
        { id: "inv_a", name: "Direct" },
        { id: "inv_b", name: "Frequent Co-Investor" },
        { id: "inv_c", name: "Occasional Co-Investor" },
      ]
    );

    const preview = await findLookalikeCandidates(prisma, ["Stripe"]);
    const byId = new Map(preview.candidates.map((c) => [c.investorId, c]));

    expect(byId.get("inv_b")!.score).toBeGreaterThan(byId.get("inv_c")!.score);
    expect(byId.get("inv_b")!.score).toBeLessThan(100);
  });

  it("returns no candidates when no deals match the comparable companies", async () => {
    const prisma = fakePrisma(
      [{ investorId: "inv_a", company: "SomeCo", sector: "fintech" }],
      [{ id: "inv_a", name: "Some Fund" }]
    );

    const preview = await findLookalikeCandidates(prisma, ["NoSuchCompany"]);
    expect(preview.candidates).toEqual([]);
    expect(preview.inferredSectors).toEqual([]);
  });
});
