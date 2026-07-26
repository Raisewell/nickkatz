import type { FastifyPluginAsync } from "fastify";
import { getStripeClient, getStripeWebhookSecret } from "../lib/stripe.js";
import { applyStripeEvent } from "../services/billing.js";

/**
 * Stripe's signature verification needs the exact raw request bytes, not Fastify's default
 * JSON-parsed body - re-serializing a parsed object never byte-matches what Stripe signed.
 * `addContentTypeParser` is scoped to this plugin's own encapsulation context (Fastify's
 * default - this file isn't wrapped with fastify-plugin), so it overrides nothing for any
 * other route registered in app.ts.
 */
const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post("/webhooks/stripe", async (request, reply) => {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    if (!stripe || !webhookSecret) {
      return reply.serviceUnavailable("Stripe webhook handling is not configured");
    }

    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return reply.badRequest("Missing stripe-signature header");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, signature, webhookSecret);
    } catch (err) {
      return reply.badRequest(`Webhook signature verification failed: ${err instanceof Error ? err.message : err}`);
    }

    // Acknowledge fast - Stripe retries on anything but 2xx, and applyStripeEvent already
    // no-ops (rather than throws) for events it can't resolve to a workspace.
    await applyStripeEvent(fastify.prisma, event);
    return reply.send({ received: true });
  });
};

export default stripeWebhookRoutes;
