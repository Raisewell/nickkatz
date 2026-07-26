import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

describe("metered usage (integration)", () => {
  let app: FastifyInstance;
  let userId: string;

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
    const user = await testPrisma.user.create({ data: { email: "founder-usage@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
  });

  it("GET /usage reports the workspace's plan limit and running total", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Usage Route WS", slug: `usage-route-ws-${Date.now()}`, ownerId: userId, usageLimit: 10 },
    });

    const before = await app.inject({ method: "GET", url: `/usage?workspaceId=${workspace.id}&userId=${userId}` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ limit: 10, used: 0, remaining: 10 });

    await testPrisma.usageEvent.create({ data: { workspaceId: workspace.id, type: "SEARCH", costUnits: 4 } });

    const after = await app.inject({ method: "GET", url: `/usage?workspaceId=${workspace.id}&userId=${userId}` });
    expect(after.json()).toMatchObject({ limit: 10, used: 4, remaining: 6 });
  });

  it("POST /searches returns 402 once the workspace's usage limit is exhausted", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Exhausted WS", slug: `exhausted-ws-${Date.now()}`, ownerId: userId, usageLimit: 0 },
    });

    const res = await app.inject({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId: workspace.id,
        createdById: userId,
        structuredQuery: {},
      },
    });

    expect(res.statusCode).toBe(402);
    const searches = await testPrisma.search.findMany({ where: { workspaceId: workspace.id } });
    expect(searches).toHaveLength(0);
  });

  it("POST /searches succeeds and records a usage event when under the limit", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Under Limit WS", slug: `under-limit-ws-${Date.now()}`, ownerId: userId, usageLimit: 50 },
    });

    const res = await app.inject({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId: workspace.id,
        createdById: userId,
        structuredQuery: {},
      },
    });

    expect(res.statusCode).toBe(200);
    const events = await testPrisma.usageEvent.findMany({ where: { workspaceId: workspace.id, type: "SEARCH" } });
    expect(events).toHaveLength(1);
    expect(events[0].costUnits).toBe(1);
  });
});
