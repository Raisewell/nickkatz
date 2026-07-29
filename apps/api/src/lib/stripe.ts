import Stripe from "stripe";

let client: Stripe | undefined;

/** Undefined (not thrown) when unconfigured, matching lib/anthropic.ts's pattern - callers
 * decide whether that's a hard error (billing routes) or a silent no-op (nothing here yet). */
export function getStripeClient(): Stripe | undefined {
  if (!process.env.STRIPE_SECRET_KEY) return undefined;
  if (!client) {
    // Pinned to the version this SDK release (stripe@17.7.0) generates types against -
    // bump together when upgrading the `stripe` package.
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
  }
  return client;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

export interface PlanDefinition {
  /** Matches Workspace.plan (free text today, not an enum - see schema.prisma). */
  id: string;
  label: string;
  usageLimit: number;
  /** Env var name holding the Stripe Price ID for this plan; null for the free plan, which has no Price. */
  priceEnvVar: string | null;
}

/**
 * The only plans Raisely sells. `usageLimit` is what actually gates behavior (see
 * services/usage.ts) - the Stripe side of a plan (its Price ID) exists only to map an
 * incoming webhook event back to one of these rows.
 */
export const PLAN_CATALOG: readonly PlanDefinition[] = [
  { id: "free", label: "Free", usageLimit: 50, priceEnvVar: null },
  { id: "starter", label: "Starter", usageLimit: 250, priceEnvVar: "STRIPE_PRICE_STARTER" },
  { id: "pro", label: "Pro", usageLimit: 1000, priceEnvVar: "STRIPE_PRICE_PRO" },
];

export const FREE_PLAN = PLAN_CATALOG[0];

export function findPlanById(planId: string): PlanDefinition | undefined {
  return PLAN_CATALOG.find((p) => p.id === planId);
}

export function findPlanByStripePriceId(priceId: string): PlanDefinition | undefined {
  return PLAN_CATALOG.find((p) => p.priceEnvVar && process.env[p.priceEnvVar] === priceId);
}

export function getPurchasablePlans(): PlanDefinition[] {
  return PLAN_CATALOG.filter((p) => p.priceEnvVar !== null);
}
