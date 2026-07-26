import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { computeThesisQueryHash } from "../lib/query-hash.js";
import { getThesisMatchQueue, closeThesisMatchQueue } from "../jobs/thesis-match-queue.js";

describe("Phase 3: cached thesis scoring + conflict detection (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeThesisMatchQueue();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
    const user = await testPrisma.user.create({ data: { email: "founder3@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    const workspace = await testPrisma.workspace.create({
      data: { name: "Phase 3 Workspace", slug: `phase3-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;
  });

  it("uses a cached Claude thesis-match score instead of the naive fallback", async () => {
    const sector = `quantum-widgets-${Date.now()}`;
    const investor = await testPrisma.investor.create({
      data: {
        name: "Quantum Widgets Capital",
        type: "VC",
        thesis: "We invest broadly with no specific sector focus.", // naive heuristic would score this ~0
        sectors: [sector],
        stages: ["seed"],
        geographies: [],
      },
    });

    const queryHash = computeThesisQueryHash([sector], []);
    await testPrisma.thesisMatchScore.create({
      data: {
        investorId: investor.id,
        queryHash,
        score: 88,
        evidence: "Claude says this is a strong semantic match",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: [],
          sectors: [sector],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const lead = body.results.find((r: { investorId: string }) => r.investorId === investor.id);
    const thesisComponent = lead.fitReasons.components.find(
      (c: { factor: string }) => c.factor === "thesis_match"
    );

    expect(thesisComponent.evidence).toBe("Claude says this is a strong semantic match");
    expect(thesisComponent.points).toBe(31); // round(35 * 88 / 100)
  });

  it("enqueues a batched thesis-match job for investors with no cached score", async () => {
    const sector = `deep-sea-logistics-${Date.now()}`;
    const investor = await testPrisma.investor.create({
      data: {
        name: "Deep Sea Logistics Fund",
        type: "VC",
        thesis: "We back deep sea logistics and maritime supply chain companies.",
        sectors: [sector],
        stages: ["seed"],
        geographies: [],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: [],
          sectors: [sector],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });
    expect(res.statusCode).toBe(200);

    const queue = getThesisMatchQueue();
    const jobs = await queue.getJobs(["waiting", "active", "delayed", "completed"]);
    const match = jobs.find((j) => j.data.investorIds.includes(investor.id));

    expect(match).toBeDefined();
    expect(match!.data.sectors).toEqual([sector]);
  });

  it("flags a portfolio company that matches an explicitly named competitor", async () => {
    const sector = `robo-lawncare-${Date.now()}`;
    const investor = await testPrisma.investor.create({
      data: {
        name: "Robo Lawncare Ventures",
        type: "VC",
        thesis: "We back robotics and home services companies.",
        sectors: [sector],
        stages: ["seed"],
        geographies: [],
        deals: { create: [{ company: "MowBot Inc", sector, stage: "seed", date: new Date() }] },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: [],
          sectors: [sector],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
          excludeCompetitorsOf: ["MowBot Inc"],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const lead = body.results.find((r: { investorId: string }) => r.investorId === investor.id);

    expect(lead.fitReasons.flags).toEqual([
      { type: "conflict", detail: "Portfolio includes MowBot Inc (" + sector + ")" },
    ]);
  });
});
