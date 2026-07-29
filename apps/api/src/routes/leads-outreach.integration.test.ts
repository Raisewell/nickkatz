import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

const mockCreate = vi.fn();

vi.mock("../lib/anthropic.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/anthropic.js")>("../lib/anthropic.js");
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: mockCreate } }),
    getAnthropicModel: () => "claude-sonnet-4-6",
  };
});

describe("leads, outreach drafting, and round planning (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;
  let searchId: string;
  let leadIds: string[];

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    mockCreate.mockReset();
    await resetDb();

    const user = await testPrisma.user.create({ data: { email: "founder-lo@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
    const workspace = await testPrisma.workspace.create({
      data: {
        name: "Leads Outreach Test Workspace",
        slug: `lo-ws-${Date.now()}`,
        ownerId: user.id,
        companyOneLiner: "Payroll infra for SMBs",
      },
    });
    workspaceId = workspace.id;

    const search = await testPrisma.search.create({
      data: {
        workspaceId,
        createdById: userId,
        structuredQuery: { stages: [], sectors: [], geographies: [], checkRange: { min: null, max: null }, investorTypes: [], keywords: [] },
        status: "COMPLETE",
      },
    });
    searchId = search.id;

    // 10 leads with descending fit scores, for tiering.
    leadIds = [];
    for (let i = 0; i < 10; i++) {
      const investor = await testPrisma.investor.create({
        data: {
          name: `Investor ${i}`,
          type: "VC",
          sectors: [],
          stages: [],
          geographies: [],
          contacts: { create: [{ name: `Contact ${i}`, email: `contact${i}@vc.com`, linkedinUrl: `https://linkedin.com/in/contact${i}` }] },
        },
      });
      const lead = await testPrisma.lead.create({
        data: { workspaceId, searchId, investorId: investor.id, fitScore: 100 - i * 10, pipelineStage: "IDENTIFIED" },
      });
      leadIds.push(lead.id);
    }
  });

  it("lists every lead in the workspace across searches, for the pipeline board", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/leads?workspaceId=${workspaceId}&userId=${userId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(leadIds.length);
    expect(body[0]).toHaveProperty("searchId", searchId);
  });

  it("filters the pipeline list by stage", async () => {
    await app.inject({
      method: "PATCH",
      url: `/leads/${leadIds[0]}`,
      payload: { workspaceId, userId, pipelineStage: "MEETING" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/leads?workspaceId=${workspaceId}&userId=${userId}&pipelineStage=MEETING`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.every((l: { pipelineStage: string }) => l.pipelineStage === "MEETING")).toBe(true);
    expect(body.some((l: { id: string }) => l.id === leadIds[0])).toBe(true);
  });

  it("updates a lead's pipeline stage, tier, and tags (Kanban drag-and-drop support)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/leads/${leadIds[0]}`,
      payload: { workspaceId, userId, pipelineStage: "CONTACTED", tier: "A", tags: ["priority"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pipelineStage: "CONTACTED", tier: "A", tags: ["priority"] });
  });

  it("drafts outreach via Claude and persists it, then allows editing before it could ever be sent", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            firstLine: "Noticed you back seed fintech - we're building payroll infra for SMBs.",
            subject: "Quick intro",
            body: "Hi, ...",
          }),
        },
      ],
    });

    const draftRes = await app.inject({
      method: "POST",
      url: `/leads/${leadIds[0]}/draft`,
      payload: { workspaceId, userId },
    });
    expect(draftRes.statusCode).toBe(201);
    const draft = draftRes.json();
    expect(draft.firstLine).toContain("payroll infra for SMBs");

    // Uses the workspace's saved company one-liner.
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Payroll infra for SMBs");

    const editRes = await app.inject({
      method: "PATCH",
      url: `/outreach-drafts/${draft.id}`,
      payload: { workspaceId, userId, firstLine: "A human-edited first line." },
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().firstLine).toBe("A human-edited first line.");

    const listRes = await app.inject({
      method: "GET",
      url: `/leads/${leadIds[0]}/drafts?workspaceId=${workspaceId}&userId=${userId}`,
    });
    expect(listRes.json()).toHaveLength(1);
  });

  it("lists outreach destinations with CSV and HeyReach implemented, others as stubs", async () => {
    const res = await app.inject({ method: "GET", url: "/outreach/destinations" });
    const destinations = res.json();
    const byKey = Object.fromEntries(destinations.map((d: { key: string; implemented: boolean }) => [d.key, d.implemented]));
    expect(byKey).toMatchObject({
      csv: true,
      heyreach: true,
      instantly: false,
      smartlead: false,
      hubspot: false,
      attio: false,
      affinity: false,
    });
  });

  it("exports leads as a downloadable CSV", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outreach/export",
      payload: { workspaceId, userId, leadIds: [leadIds[0], leadIds[1]] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Investor 0");
    expect(res.body).toContain("Investor 1");
  });

  it("sends via the CSV destination through the unified /outreach/send endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outreach/send",
      payload: { workspaceId, userId, destination: "csv", leadIds: [leadIds[0]] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ destination: "csv", succeeded: 1, failed: 0 });
  });

  it("returns 501 for an unimplemented destination instead of pretending to send", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outreach/send",
      payload: { workspaceId, userId, destination: "hubspot", leadIds: [leadIds[0]] },
    });
    expect(res.statusCode).toBe(501);
  });

  it("returns 400 for an unknown destination key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/outreach/send",
      payload: { workspaceId, userId, destination: "not-a-real-thing", leadIds: [leadIds[0]] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("suggests a target list size for a round via the rule-of-thumb table", async () => {
    const res = await app.inject({ method: "POST", url: "/round-plan", payload: { stage: "seed", roundSizeUsd: 3_000_000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().targetListSize.min).toBeLessThanOrEqual(res.json().targetListSize.recommended);
  });

  it("auto-tiers a search's leads by fit-score percentile", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/searches/${searchId}/tier?workspaceId=${workspaceId}&userId=${userId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tiered).toBe(10);

    const leads = await testPrisma.lead.findMany({ where: { searchId }, orderBy: { fitScore: "desc" } });
    // Top 20% (2 of 10) -> A, next 30% (3 of 10) -> B, rest -> C.
    expect(leads.slice(0, 2).every((l) => l.tier === "A")).toBe(true);
    expect(leads.slice(2, 5).every((l) => l.tier === "B")).toBe(true);
    expect(leads.slice(5).every((l) => l.tier === "C")).toBe(true);
  });
});
