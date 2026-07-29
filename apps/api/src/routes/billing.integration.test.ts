import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

describe("billing routes (integration)", () => {
  let app: FastifyInstance;
  let userId: string;
  const originalEnv = { ...process.env };

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
    delete process.env.STRIPE_SECRET_KEY; // route-level tests never exercise real Stripe calls (see billing.test.ts for that)
    const user = await testPrisma.user.create({ data: { email: "founder-billing@integration-test.dev", role: "FOUNDER" } });
    userId = user.id;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("GET /billing/plans lists the purchasable plans without requiring auth or Stripe config", async () => {
    const res = await app.inject({ method: "GET", url: "/billing/plans" });

    expect(res.statusCode).toBe(200);
    expect(res.json().plans).toEqual([
      { id: "starter", label: "Starter", usageLimit: 250 },
      { id: "pro", label: "Pro", usageLimit: 1000 },
    ]);
  });

  it("GET /billing reports the workspace's current plan/usage state", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Billing Route WS", slug: `billing-route-ws-${Date.now()}`, ownerId: userId },
    });

    const res = await app.inject({ method: "GET", url: `/billing?workspaceId=${workspace.id}&userId=${userId}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ plan: "free", planLabel: "Free", usageLimit: 50, hasStripeCustomer: false });
  });

  it("GET /billing 403s for a user with no membership in the workspace", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Other WS", slug: `other-ws-${Date.now()}`, ownerId: userId },
    });
    const outsider = await testPrisma.user.create({ data: { email: "outsider@integration-test.dev", role: "FOUNDER" } });

    const res = await app.inject({ method: "GET", url: `/billing?workspaceId=${workspace.id}&userId=${outsider.id}` });
    expect(res.statusCode).toBe(403);
  });

  it("POST /billing/checkout 503s when Stripe isn't configured", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Checkout WS", slug: `checkout-ws-${Date.now()}`, ownerId: userId },
    });

    const res = await app.inject({
      method: "POST",
      url: "/billing/checkout",
      payload: {
        workspaceId: workspace.id,
        userId,
        plan: "starter",
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      },
    });

    expect(res.statusCode).toBe(503);
  });

  it("POST /billing/checkout still enforces workspace membership before checking Stripe config", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Checkout WS 2", slug: `checkout-ws-2-${Date.now()}`, ownerId: userId },
    });
    const outsider = await testPrisma.user.create({ data: { email: "outsider2@integration-test.dev", role: "FOUNDER" } });

    const res = await app.inject({
      method: "POST",
      url: "/billing/checkout",
      payload: {
        workspaceId: workspace.id,
        userId: outsider.id,
        plan: "starter",
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /billing/portal 503s when Stripe isn't configured", async () => {
    const workspace = await testPrisma.workspace.create({
      data: { name: "Portal WS", slug: `portal-ws-${Date.now()}`, ownerId: userId, stripeCustomerId: "cus_123" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/billing/portal",
      payload: { workspaceId: workspace.id, userId, returnUrl: "https://app.test/settings" },
    });

    expect(res.statusCode).toBe(503);
  });
});
