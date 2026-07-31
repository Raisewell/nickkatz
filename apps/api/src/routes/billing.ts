import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  billingWorkspaceIdQuerySchema,
  billingSummarySchema,
  checkoutSessionBodySchema,
  checkoutSessionResponseSchema,
  portalSessionBodySchema,
  portalSessionResponseSchema,
} from "../schemas/billing.js";
import { assertWorkspaceMember, assertWorkspaceOwner } from "../lib/authz.js";
import { getCurrentPeriodUsage } from "../services/usage.js";
import { getStripeClient, getStripeProPriceId } from "../lib/stripe.js";

function webUrl(): string {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}

const billingRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "Current plan, usage this period, and subscription status for a workspace",
        querystring: billingWorkspaceIdQuerySchema,
        response: { 200: billingSummarySchema },
      },
    },
    async (request) => {
      const { workspaceId } = request.query;
      await assertWorkspaceMember(fastify, request, workspaceId);

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { plan: true, usageLimit: true, stripeSubscriptionStatus: true },
      });
      const usedThisPeriod = await getCurrentPeriodUsage(fastify.prisma, workspaceId);

      return {
        plan: workspace.plan,
        usageLimit: workspace.usageLimit,
        usedThisPeriod,
        subscriptionStatus: workspace.stripeSubscriptionStatus,
        stripeConfigured: !!getStripeClient(),
      };
    }
  );

  fastify.post(
    "/checkout-session",
    {
      schema: {
        summary:
          "Start a Stripe Checkout session to upgrade a workspace to Pro. Owner-only. The workspace's plan/usageLimit are updated by the checkout.session.completed webhook, not this endpoint.",
        body: checkoutSessionBodySchema,
        response: { 200: checkoutSessionResponseSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.body;
      await assertWorkspaceOwner(fastify, request, workspaceId);

      const stripe = getStripeClient();
      const priceId = getStripeProPriceId();
      if (!stripe || !priceId) {
        return reply.serviceUnavailable(
          "Billing isn't configured in this environment (STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PRO)"
        );
      }

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { owner: { select: { email: true } } },
      });

      let customerId = workspace.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: workspace.owner.email,
          metadata: { workspaceId: workspace.id },
        });
        customerId = customer.id;
        await fastify.prisma.workspace.update({
          where: { id: workspaceId },
          data: { stripeCustomerId: customerId },
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${webUrl()}/billing?checkout=success`,
        cancel_url: `${webUrl()}/billing?checkout=cancelled`,
        metadata: { workspaceId: workspace.id },
        subscription_data: { metadata: { workspaceId: workspace.id } },
      });

      if (!session.url) return reply.internalServerError("Stripe did not return a checkout URL");
      return { url: session.url };
    }
  );

  fastify.post(
    "/portal-session",
    {
      schema: {
        summary: "Start a Stripe Billing Portal session so the owner can manage or cancel the subscription",
        body: portalSessionBodySchema,
        response: { 200: portalSessionResponseSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.body;
      await assertWorkspaceOwner(fastify, request, workspaceId);

      const stripe = getStripeClient();
      if (!stripe) {
        return reply.serviceUnavailable("Billing isn't configured in this environment (STRIPE_SECRET_KEY)");
      }

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });
      if (!workspace.stripeCustomerId) {
        return reply.badRequest("This workspace has no billing account yet - start a checkout first");
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripeCustomerId,
        return_url: `${webUrl()}/billing`,
      });
      return { url: session.url };
    }
  );
};

export default billingRoutes;
