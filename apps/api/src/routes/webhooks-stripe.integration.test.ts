import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { buildApp } from "../app.js";
import { resetDb, testPrisma } from "../test/db.js";

// Constructing a Stripe client and signing a payload with it are both local/crypto-only
// operations - no network call happens until a method like customers.create is invoked.
// That lets this test exercise the real route (raw-body parsing, signature verification,
// applyStripeEvent) fully in-process.
const WEBHOOK_SECRET = "whsec_test_secret";
const signingStripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });

function signedPayload(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const signature = signingStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature };
}

describe("POST /webhooks/stripe (integration)", () => {
  let app: FastifyInstance;
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
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("503s when Stripe/webhook secret isn't configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { payload, signature } = signedPayload({ id: "evt_1", type: "invoice.paid", data: { object: {} } });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      payload,
    });

    expect(res.statusCode).toBe(503);
  });

  it("400s when the signature is missing or invalid", async () => {
    const { payload } = signedPayload({ id: "evt_1", type: "invoice.paid", data: { object: {} } });

    const missing = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(missing.statusCode).toBe(400);

    const wrongSecret = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" }).webhooks.generateTestHeaderString({
          payload,
          secret: "whsec_wrong",
        }),
      },
      payload,
    });
    expect(wrongSecret.statusCode).toBe(400);
  });

  it("applies a valid checkout.session.completed event and persists it to the workspace", async () => {
    const user = await testPrisma.user.create({ data: { email: "webhook-user@integration-test.dev", role: "FOUNDER" } });
    const workspace = await testPrisma.workspace.create({
      data: { name: "Webhook WS", slug: `webhook-ws-${Date.now()}`, ownerId: user.id },
    });

    const { payload, signature } = signedPayload({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: workspace.id,
          customer: "cus_webhook_test",
          subscription: "sub_webhook_test",
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });

    const updated = await testPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(updated.stripeCustomerId).toBe("cus_webhook_test");
    expect(updated.stripeSubscriptionId).toBe("sub_webhook_test");
  });

  it("still returns 200 for a well-signed event it can't resolve to a workspace, so Stripe doesn't retry forever", async () => {
    const { payload, signature } = signedPayload({
      id: "evt_orphan",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_orphan",
          customer: "cus_orphan",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000),
          items: { data: [] },
          metadata: {},
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      payload,
    });

    expect(res.statusCode).toBe(200);
  });
});
