import Stripe from "stripe";

let client: Stripe | undefined;

export function getStripeClient(): Stripe | undefined {
  if (!process.env.STRIPE_SECRET_KEY) return undefined;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function getStripeProPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID_PRO;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
