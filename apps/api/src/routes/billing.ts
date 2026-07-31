import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  billingSummaryQuerySchema,
  billingSummarySchema,
  checkoutBodySchema,
  checkoutResponseSchema,
  listPlansResponseSchema,
  portalBodySchema,
  portalResponseSchema,
} from "../schemas/billing.js";
import { getStripeClient, getPurchasablePlans } from "../lib/stripe.js";
import {
  createCheckoutSession,
  createPortalSession,
  getBillingSummary,
  NoStripeCustomerError,
  PlanNotConfiguredError,
  UnknownPlanError,
} from "../services/billing.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

const billingRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "Current plan, usage limit, and Stripe subscription status for a workspace",
        querystring: billingSummaryQuerySchema,
        response: { 200: billingSummarySchema },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      return getBillingSummary(db, workspaceId);
    }
  );

  fastify.get(
    "/plans",
    {
      schema: {
        summary: "Purchasable plans (excludes the default free plan, which has no checkout flow)",
        response: { 200: listPlansResponseSchema },
      },
    },
    async () => {
      return { plans: getPurchasablePlans().map(({ id, label, usageLimit }) => ({ id, label, usageLimit })) };
    }
  );

  fastify.post(
    "/checkout",
    {
      schema: {
        summary: "Create a Stripe Checkout session to subscribe a workspace to a paid plan",
        body: checkoutBodySchema,
        response: { 200: checkoutResponseSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, plan, successUrl, cancelUrl } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const stripe = getStripeClient();
      if (!stripe) return reply.serviceUnavailable("Billing is not configured (STRIPE_SECRET_KEY unset)");

      try {
        const session = await createCheckoutSession(db, stripe, { workspaceId, planId: plan, successUrl, cancelUrl });
        if (!session.url) return reply.internalServerError("Stripe did not return a Checkout URL");
        return { url: session.url };
      } catch (err) {
        if (err instanceof UnknownPlanError || err instanceof PlanNotConfiguredError) {
          return reply.badRequest(err.message);
        }
        throw err;
      }
    }
  );

  fastify.post(
    "/portal",
    {
      schema: {
        summary: "Create a Stripe billing portal session for a workspace to manage/cancel its subscription",
        body: portalBodySchema,
        response: { 200: portalResponseSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, returnUrl } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const stripe = getStripeClient();
      if (!stripe) return reply.serviceUnavailable("Billing is not configured (STRIPE_SECRET_KEY unset)");

      try {
        const session = await createPortalSession(db, stripe, { workspaceId, returnUrl });
        return { url: session.url };
      } catch (err) {
        if (err instanceof NoStripeCustomerError) {
          return reply.badRequest(err.message);
        }
        throw err;
      }
    }
  );
};

export default billingRoutes;
