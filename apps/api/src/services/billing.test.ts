import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { resetDb, testPrisma } from "../test/db.js";
import {
  applyStripeEvent,
  createCheckoutSession,
  createPortalSession,
  getBillingSummary,
  NoStripeCustomerError,
  PlanNotConfiguredError,
  UnknownPlanError,
} from "./billing.js";

const STARTER_PRICE_ID = "price_test_starter";
const PRO_PRICE_ID = "price_test_pro";

async function makeWorkspace(overrides: Partial<{ stripeCustomerId: string | null }> = {}) {
  const user = await testPrisma.user.create({
    data: { email: `billing-${Date.now()}-${Math.random()}@integration-test.dev`, role: "FOUNDER" },
  });
  return testPrisma.workspace.create({
    data: {
      name: "Billing Test WS",
      slug: `billing-ws-${Date.now()}-${Math.random()}`,
      ownerId: user.id,
      ...overrides,
    },
  });
}

/** Fake Stripe client exposing only the surface billing.ts actually calls, so tests never hit the network. */
function fakeStripe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test-session" }) } },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/test-portal" }) } },
    ...overrides,
  } as unknown as Stripe;
}

function stripeEvent<T>(type: string, object: T): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event;
}

describe("billing service (integration)", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await resetDb();
    process.env.STRIPE_PRICE_STARTER = STARTER_PRICE_ID;
    process.env.STRIPE_PRICE_PRO = PRO_PRICE_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe("createCheckoutSession", () => {
    it("creates and persists a Stripe customer on first checkout, then creates a subscription session", async () => {
      const workspace = await makeWorkspace();
      const stripe = fakeStripe();

      const session = await createCheckoutSession(testPrisma, stripe, {
        workspaceId: workspace.id,
        planId: "starter",
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      });

      expect(session.url).toBe("https://checkout.stripe.com/test-session");
      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { workspaceId: workspace.id } })
      );
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          customer: "cus_new",
          client_reference_id: workspace.id,
          line_items: [{ price: STARTER_PRICE_ID, quantity: 1 }],
          subscription_data: { metadata: { workspaceId: workspace.id } },
        })
      );

      const updated = await testPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
      expect(updated.stripeCustomerId).toBe("cus_new");
    });

    it("reuses an existing Stripe customer instead of creating a new one", async () => {
      const workspace = await makeWorkspace({ stripeCustomerId: "cus_existing" });
      const stripe = fakeStripe();

      await createCheckoutSession(testPrisma, stripe, {
        workspaceId: workspace.id,
        planId: "pro",
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      });

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_existing", line_items: [{ price: PRO_PRICE_ID, quantity: 1 }] })
      );
    });

    it("throws UnknownPlanError for the free plan (not purchasable) or a nonexistent plan id", async () => {
      const workspace = await makeWorkspace();
      const stripe = fakeStripe();

      await expect(
        createCheckoutSession(testPrisma, stripe, {
          workspaceId: workspace.id,
          planId: "free",
          successUrl: "https://app.test/success",
          cancelUrl: "https://app.test/cancel",
        })
      ).rejects.toThrow(UnknownPlanError);

      await expect(
        createCheckoutSession(testPrisma, stripe, {
          workspaceId: workspace.id,
          planId: "does-not-exist",
          successUrl: "https://app.test/success",
          cancelUrl: "https://app.test/cancel",
        })
      ).rejects.toThrow(UnknownPlanError);
    });

    it("throws PlanNotConfiguredError when the plan's Stripe Price env var isn't set", async () => {
      delete process.env.STRIPE_PRICE_STARTER;
      const workspace = await makeWorkspace();
      const stripe = fakeStripe();

      await expect(
        createCheckoutSession(testPrisma, stripe, {
          workspaceId: workspace.id,
          planId: "starter",
          successUrl: "https://app.test/success",
          cancelUrl: "https://app.test/cancel",
        })
      ).rejects.toThrow(PlanNotConfiguredError);
    });
  });

  describe("createPortalSession", () => {
    it("throws NoStripeCustomerError when the workspace has never checked out", async () => {
      const workspace = await makeWorkspace();
      const stripe = fakeStripe();

      await expect(
        createPortalSession(testPrisma, stripe, { workspaceId: workspace.id, returnUrl: "https://app.test/settings" })
      ).rejects.toThrow(NoStripeCustomerError);
    });

    it("creates a portal session for the workspace's existing customer", async () => {
      const workspace = await makeWorkspace({ stripeCustomerId: "cus_existing" });
      const stripe = fakeStripe();

      const session = await createPortalSession(testPrisma, stripe, {
        workspaceId: workspace.id,
        returnUrl: "https://app.test/settings",
      });

      expect(session.url).toBe("https://billing.stripe.com/test-portal");
      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: "cus_existing",
        return_url: "https://app.test/settings",
      });
    });
  });

  describe("applyStripeEvent", () => {
    it("checkout.session.completed persists the customer/subscription ids by client_reference_id", async () => {
      const workspace = await makeWorkspace();

      await applyStripeEvent(
        testPrisma,
        stripeEvent("checkout.session.completed", {
          client_reference_id: workspace.id,
          customer: "cus_from_checkout",
          subscription: "sub_from_checkout",
        })
      );

      const updated = await testPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
      expect(updated.stripeCustomerId).toBe("cus_from_checkout");
      expect(updated.stripeSubscriptionId).toBe("sub_from_checkout");
    });

    it("customer.subscription.updated sets plan/usageLimit/status/currentPeriodEnd by metadata.workspaceId", async () => {
      const workspace = await makeWorkspace();
      const periodEndSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      await applyStripeEvent(
        testPrisma,
        stripeEvent("customer.subscription.updated", {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          current_period_end: periodEndSeconds,
          items: { data: [{ price: { id: STARTER_PRICE_ID } }] },
          metadata: { workspaceId: workspace.id },
        })
      );

      const updated = await testPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
      expect(updated.plan).toBe("starter");
      expect(updated.usageLimit).toBe(250);
      expect(updated.subscriptionStatus).toBe("ACTIVE");
      expect(updated.stripeSubscriptionId).toBe("sub_123");
      expect(updated.currentPeriodEnd?.getTime()).toBe(periodEndSeconds * 1000);
    });

    it("customer.subscription.deleted reverts the workspace to the free plan", async () => {
      const workspace = await testPrisma.workspace.update({
        where: { id: (await makeWorkspace()).id },
        data: {
          plan: "pro",
          usageLimit: 1000,
          stripeSubscriptionId: "sub_123",
          subscriptionStatus: "ACTIVE",
          currentPeriodEnd: new Date(),
        },
      });

      await applyStripeEvent(
        testPrisma,
        stripeEvent("customer.subscription.deleted", {
          id: "sub_123",
          customer: "cus_123",
          metadata: { workspaceId: workspace.id },
        })
      );

      const updated = await testPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
      expect(updated.plan).toBe("free");
      expect(updated.usageLimit).toBe(50);
      expect(updated.subscriptionStatus).toBe("CANCELED");
      expect(updated.stripeSubscriptionId).toBeNull();
      expect(updated.currentPeriodEnd).toBeNull();
    });

    it("no-ops (does not throw) when metadata.workspaceId is missing or unknown", async () => {
      await expect(
        applyStripeEvent(
          testPrisma,
          stripeEvent("customer.subscription.updated", {
            id: "sub_orphan",
            customer: "cus_orphan",
            status: "active",
            current_period_end: Math.floor(Date.now() / 1000),
            items: { data: [] },
            metadata: {},
          })
        )
      ).resolves.toBeUndefined();

      await expect(
        applyStripeEvent(
          testPrisma,
          stripeEvent("customer.subscription.updated", {
            id: "sub_ghost",
            customer: "cus_ghost",
            status: "active",
            current_period_end: Math.floor(Date.now() / 1000),
            items: { data: [] },
            metadata: { workspaceId: "does-not-exist" },
          })
        )
      ).resolves.toBeUndefined();
    });

    it("ignores event types it doesn't handle", async () => {
      await expect(applyStripeEvent(testPrisma, stripeEvent("invoice.paid", {}))).resolves.toBeUndefined();
    });
  });

  describe("getBillingSummary", () => {
    it("returns the workspace's current plan/usage/subscription state", async () => {
      const workspace = await makeWorkspace({ stripeCustomerId: "cus_123" });

      const summary = await getBillingSummary(testPrisma, workspace.id);

      expect(summary).toMatchObject({
        plan: "free",
        planLabel: "Free",
        usageLimit: 50,
        subscriptionStatus: null,
        hasStripeCustomer: true,
      });
    });
  });
});
