import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "light-my-request";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { signTestToken } from "../test/auth.js";

describe("search execution + exclusion filtering (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let userId: string;
  let token: string;
  let fintechSeedInvestorId: string;
  let healthtechGrowthInvestorId: string;

  function authed(opts: InjectOptions) {
    return app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...opts.headers } });
  }

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb();

    const user = await testPrisma.user.create({
      data: { email: "founder@integration-test.dev", name: "Test Founder", role: "FOUNDER" },
    });
    userId = user.id;
    token = await signTestToken(userId);

    const workspace = await testPrisma.workspace.create({
      data: { name: "Test Workspace", slug: `test-ws-${Date.now()}`, ownerId: user.id },
    });
    workspaceId = workspace.id;

    const fintechSeed = await testPrisma.investor.create({
      data: {
        name: "Fintech Seed Ventures",
        type: "VC",
        thesis: "We back seed b2b payments and fintech infrastructure companies in the UK and EU.",
        sectors: ["fintech", "b2b saas"],
        stages: ["seed"],
        geographies: ["UK", "EU"],
        checkMin: 250_000,
        checkMax: 3_000_000,
        lastFundCloseDate: new Date(),
        linkedinUrl: "https://www.linkedin.com/company/fintech-seed-ventures",
        deals: {
          create: [
            { company: "PaySplit", sector: "fintech", stage: "seed", date: new Date() },
            { company: "LedgerFlow", sector: "fintech", stage: "seed", date: new Date() },
          ],
        },
        contacts: {
          create: [{ name: "Alex Partner", email: "alex@fintechseed.vc", linkedinUrl: "https://linkedin.com/in/alexpartner" }],
        },
      },
    });
    fintechSeedInvestorId = fintechSeed.id;

    const healthtechGrowth = await testPrisma.investor.create({
      data: {
        name: "Healthtech Growth Capital",
        type: "VC",
        thesis: "We lead growth rounds in healthtech and biotech companies across the US.",
        sectors: ["healthtech", "biotech"],
        stages: ["growth"],
        geographies: ["US"],
        checkMin: 20_000_000,
        checkMax: 80_000_000,
        lastFundCloseDate: new Date("2020-01-01"),
      },
    });
    healthtechGrowthInvestorId = healthtechGrowth.id;
  });

  it("filters investors by structured query and ranks them by fit score", async () => {
    const res = await authed({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        name: "B2B fintech seed",
        structuredQuery: {
          stages: ["seed"],
          sectors: ["fintech"],
          geographies: ["UK", "EU"],
          checkRange: { min: 250_000, max: 3_000_000 },
          investorTypes: ["VC"],
          keywords: [],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].investorId).toBe(fintechSeedInvestorId);
    expect(body.results[0].fitScore).toBeGreaterThan(0);
    expect(body.results[0].fitReasons.components).toHaveLength(5);
    expect(body.pagination.total).toBe(1);
    expect(body.excludedCount).toBe(0);

    const persistedLeads = await testPrisma.lead.findMany({ where: { searchId: body.search.id } });
    expect(persistedLeads).toHaveLength(1);
  });

  it("hides excluded investors and reports the excluded count", async () => {
    const list = await testPrisma.exclusionList.create({
      data: { workspaceId, name: "LinkedIn connections" },
    });
    await testPrisma.exclusionEntry.create({
      data: {
        exclusionListId: list.id,
        linkedinUrl: "https://www.linkedin.com/company/fintech-seed-ventures",
        source: "LINKEDIN_IMPORT",
      },
    });

    const res = await authed({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: ["seed"],
          sectors: ["fintech"],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.results).toHaveLength(0);
    expect(body.excludedCount).toBe(1);
    expect(body.search.excludedCount).toBe(1);
  });

  it("excludes a contact-level match even when the firm itself isn't excluded", async () => {
    const list = await testPrisma.exclusionList.create({ data: { workspaceId, name: "CSV import" } });
    await testPrisma.exclusionEntry.create({
      data: { exclusionListId: list.id, email: "alex@fintechseed.vc", source: "CSV" },
    });

    const res = await authed({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: [],
          sectors: [],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });

    const body = res.json();
    const investorIds = body.results.map((r: { investorId: string }) => r.investorId);
    expect(investorIds).not.toContain(fintechSeedInvestorId);
    expect(investorIds).toContain(healthtechGrowthInvestorId);
    expect(body.excludedCount).toBe(1);
  });

  it("saves, renames, and re-runs a search as a new linked Search row", async () => {
    const created = await authed({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        name: "Original name",
        structuredQuery: {
          stages: [],
          sectors: [],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });
    const searchId = created.json().search.id;

    const patched = await authed({
      method: "PATCH",
      url: `/searches/${searchId}`,
      payload: { name: "Renamed search", saved: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe("Renamed search");
    expect(patched.json().saved).toBe(true);

    const rerun = await authed({
      method: "POST",
      url: `/searches/${searchId}/rerun`,
      payload: { createdById: userId },
    });
    expect(rerun.statusCode).toBe(200);
    const rerunBody = rerun.json();
    expect(rerunBody.search.id).not.toBe(searchId);

    const rerunRow = await testPrisma.search.findUniqueOrThrow({ where: { id: rerunBody.search.id } });
    expect(rerunRow.savedSearchId).toBe(searchId);

    const list = await authed({ method: "GET", url: `/searches?workspaceId=${workspaceId}&saved=true` });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].id).toBe(searchId);
  });

  it("deletes a search", async () => {
    const created = await authed({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
        createdById: userId,
        structuredQuery: {
          stages: [],
          sectors: [],
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
      },
    });
    const searchId = created.json().search.id;

    const del = await authed({ method: "DELETE", url: `/searches/${searchId}` });
    expect(del.statusCode).toBe(204);

    const getAfter = await authed({ method: "GET", url: `/searches/${searchId}` });
    expect(getAfter.statusCode).toBe(404);
  });
});
