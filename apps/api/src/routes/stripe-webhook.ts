import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { getStripeClient, getStripeWebhookSecret } from "../lib/stripe.js";

const PRO_USAGE_LIMIT = 500;
const FREE_USAGE_LIMIT = 50;

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

async function syncWorkspaceFromSubscription(
  fastify: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  subscription: Stripe.Subscription
) {
  const isActive = ACTIVE_STATUSES.has(subscription.status);
  await fastify.prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      plan: isActive ? "pro" : "free",
      usageLimit: isActive ? PRO_USAGE_LIMIT : FREE_USAGE_LIMIT,
    },
  });
}

/** Not wrapped with fastify-plugin, so this content-type parser override
 * only applies within this plugin's own encapsulation context - the rest of
 * the app keeps the normal JSON body parser. Stripe requires the exact raw
 * request bytes (not a re-serialized JSON.stringify of the parsed body) to
 * verify the webhook signature. */
const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post("/", async (request, reply) => {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    if (!stripe || !webhookSecret) {
      return reply.serviceUnavailable("Stripe webhooks aren't configured in this environment");
    }

    const signature = request.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return reply.badRequest("Missing stripe-signature header");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, signature, webhookSecret);
    } catch (err) {
      request.log.warn({ err }, "Stripe webhook signature verification failed");
      return reply.badRequest("Invalid signature");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const workspaceId = session.metadata?.workspaceId;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (workspaceId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncWorkspaceFromSubscription(fastify, workspaceId, subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const workspaceId =
          subscription.metadata?.workspaceId ??
          (
            await fastify.prisma.workspace.findUnique({
              where: { stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id },
              select: { id: true },
            })
          )?.id;
        if (workspaceId) await syncWorkspaceFromSubscription(fastify, workspaceId, subscription);
        break;
      }
      default:
        break;
    }

    return reply.send({ received: true });
  });
};

export default stripeWebhookRoutes;
