import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "light-my-request";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";
import { signTestToken } from "../test/auth.js";

describe("billing + usage metering (integration)", () => {
  let app: FastifyInstance;
  let workspaceId: string;
  let ownerId: string;
  let ownerToken: string;
  let memberId: string;
  let memberToken: string;

  function authedAs(token: string) {
    return (opts: InjectOptions) => app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...opts.headers } });
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

    const owner = await testPrisma.user.create({ data: { email: "billing-owner@integration-test.dev", role: "FOUNDER" } });
    ownerId = owner.id;
    ownerToken = await signTestToken(ownerId);

    const member = await testPrisma.user.create({ data: { email: "billing-member@integration-test.dev", role: "FOUNDER" } });
    memberId = member.id;
    memberToken = await signTestToken(memberId);

    const workspace = await testPrisma.workspace.create({
      data: { name: "Billing Test Workspace", slug: `billing-ws-${Date.now()}`, ownerId: owner.id },
    });
    workspaceId = workspace.id;

    await testPrisma.workspaceMember.create({
      data: { workspaceId, userId: member.id, role: "MEMBER" },
    });
  });

  it("reports plan/usage/subscription status for a workspace member", async () => {
    await testPrisma.usageEvent.create({
      data: { workspaceId, userId: ownerId, type: "SEARCH", costUnits: 3 },
    });

    const res = await authedAs(memberToken)({ method: "GET", url: `/billing?workspaceId=${workspaceId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      plan: "free",
      usageLimit: 50,
      usedThisPeriod: 3,
      subscriptionStatus: null,
      stripeConfigured: false,
    });
  });

  it("rejects billing access for someone outside the workspace", async () => {
    const outsider = await testPrisma.user.create({ data: { email: "outsider@integration-test.dev", role: "FOUNDER" } });
    const outsiderToken = await signTestToken(outsider.id);

    const res = await authedAs(outsiderToken)({ method: "GET", url: `/billing?workspaceId=${workspaceId}` });
    expect(res.statusCode).toBe(403);
  });

  it("returns 503 for checkout/portal sessions when Stripe isn't configured (no STRIPE_SECRET_KEY in test env)", async () => {
    const checkout = await authedAs(ownerToken)({
      method: "POST",
      url: "/billing/checkout-session",
      payload: { workspaceId },
    });
    expect(checkout.statusCode).toBe(503);

    const portal = await authedAs(ownerToken)({
      method: "POST",
      url: "/billing/portal-session",
      payload: { workspaceId },
    });
    expect(portal.statusCode).toBe(503);
  });

  it("rejects checkout/portal session requests from a non-owner member", async () => {
    const checkout = await authedAs(memberToken)({
      method: "POST",
      url: "/billing/checkout-session",
      payload: { workspaceId },
    });
    expect(checkout.statusCode).toBe(403);

    const portal = await authedAs(memberToken)({
      method: "POST",
      url: "/billing/portal-session",
      payload: { workspaceId },
    });
    expect(portal.statusCode).toBe(403);
  });

  it("blocks a billable action with 402 once the workspace is at its usage limit", async () => {
    await testPrisma.workspace.update({ where: { id: workspaceId }, data: { usageLimit: 1 } });
    await testPrisma.usageEvent.create({ data: { workspaceId, userId: ownerId, type: "SEARCH", costUnits: 1 } });

    const res = await authedAs(ownerToken)({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
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
    expect(res.statusCode).toBe(402);
  });

  it("records a SEARCH usage event when a search runs successfully", async () => {
    const res = await authedAs(ownerToken)({
      method: "POST",
      url: "/searches",
      payload: {
        workspaceId,
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
    expect(res.statusCode).toBe(200);

    const events = await testPrisma.usageEvent.findMany({ where: { workspaceId, type: "SEARCH" } });
    expect(events).toHaveLength(1);
    expect(events[0].costUnits).toBe(1);
  });
});
