import type Stripe from "stripe";
import type { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { FREE_PLAN, findPlanById, findPlanByStripePriceId } from "../lib/stripe.js";

export interface BillingSummary {
  plan: string;
  planLabel: string;
  usageLimit: number;
  subscriptionStatus: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  hasStripeCustomer: boolean;
}

export async function getBillingSummary(prisma: PrismaClient, workspaceId: string): Promise<BillingSummary> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      plan: true,
      usageLimit: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      stripeCustomerId: true,
    },
  });

  return {
    plan: workspace.plan,
    planLabel: findPlanById(workspace.plan)?.label ?? workspace.plan,
    usageLimit: workspace.usageLimit,
    subscriptionStatus: workspace.subscriptionStatus,
    currentPeriodEnd: workspace.currentPeriodEnd,
    hasStripeCustomer: workspace.stripeCustomerId !== null,
  };
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("STRIPE_SECRET_KEY is not configured");
    this.name = "StripeNotConfiguredError";
  }
}

export class UnknownPlanError extends Error {
  constructor(planId: string) {
    super(`Unknown or non-purchasable plan "${planId}"`);
    this.name = "UnknownPlanError";
  }
}

export class PlanNotConfiguredError extends Error {
  constructor(planId: string, envVar: string) {
    super(`Plan "${planId}" has no Stripe Price configured (${envVar} is unset)`);
    this.name = "PlanNotConfiguredError";
  }
}

export class NoStripeCustomerError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} has no Stripe customer yet - complete a checkout first`);
    this.name = "NoStripeCustomerError";
  }
}

export interface CreateCheckoutSessionParams {
  workspaceId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Creates (and persists) a Stripe customer for the workspace on first use, then a
 * subscription-mode Checkout Session for the requested plan. `client_reference_id` and
 * `subscription_data.metadata.workspaceId` both carry the workspace id through to the
 * resulting Subscription object so webhook handlers can find their way back to a
 * workspace regardless of event delivery order (see applyStripeEvent below).
 */
export async function createCheckoutSession(
  prisma: PrismaClient,
  stripe: Stripe,
  params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const plan = findPlanById(params.planId);
  if (!plan || !plan.priceEnvVar) {
    throw new UnknownPlanError(params.planId);
  }
  const priceId = process.env[plan.priceEnvVar];
  if (!priceId) {
    throw new PlanNotConfiguredError(plan.id, plan.priceEnvVar);
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: params.workspaceId },
    select: { id: true, name: true, stripeCustomerId: true },
  });

  let customerId = workspace.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: workspace.name,
      metadata: { workspaceId: workspace.id },
    });
    customerId = customer.id;
    await prisma.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: customerId } });
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: workspace.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { workspaceId: workspace.id } },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

export interface CreatePortalSessionParams {
  workspaceId: string;
  returnUrl: string;
}

export async function createPortalSession(
  prisma: PrismaClient,
  stripe: Stripe,
  params: CreatePortalSessionParams
): Promise<Stripe.BillingPortal.Session> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: params.workspaceId },
    select: { stripeCustomerId: true },
  });
  if (!workspace.stripeCustomerId) {
    throw new NoStripeCustomerError(params.workspaceId);
  }

  return stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: params.returnUrl,
  });
}

const STRIPE_STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  paused: "INCOMPLETE", // no direct equivalent in our enum; treat as non-active rather than invent a new status
};

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  return STRIPE_STATUS_MAP[status] ?? "INCOMPLETE";
}

function toCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Applies one Stripe webhook event to the database. Every branch is a no-op (not a throw)
 * when it can't resolve a workspace - webhook delivery can race a workspace's own deletion,
 * or arrive for test-mode events with no corresponding local data, and Stripe will keep
 * retrying on non-2xx responses, so "can't find it" must not become a 500 loop.
 */
export async function applyStripeEvent(prisma: PrismaClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.client_reference_id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!workspaceId || !session.customer || !subscriptionId) return;

      await prisma.workspace
        .update({
          where: { id: workspaceId },
          data: { stripeCustomerId: toCustomerId(session.customer), stripeSubscriptionId: subscriptionId },
        })
        .catch(() => undefined); // workspace may no longer exist; subscription.* events below are the source of truth for plan/status anyway
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.workspaceId;
      if (!workspaceId) return;

      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;

      await prisma.workspace
        .update({
          where: { id: workspaceId },
          data: {
            stripeCustomerId: toCustomerId(subscription.customer),
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: mapStripeStatus(subscription.status),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...(plan ? { plan: plan.id, usageLimit: plan.usageLimit } : {}),
          },
        })
        .catch(() => undefined);
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.workspaceId;
      if (!workspaceId) return;

      await prisma.workspace
        .update({
          where: { id: workspaceId },
          data: {
            stripeSubscriptionId: null,
            subscriptionStatus: "CANCELED",
            currentPeriodEnd: null,
            plan: FREE_PLAN.id,
            usageLimit: FREE_PLAN.usageLimit,
          },
        })
        .catch(() => undefined);
      return;
    }

    default:
      return; // every other event type is intentionally ignored
  }
}
