import { z } from "zod";

export const billingWorkspaceIdQuerySchema = z.object({ workspaceId: z.string().min(1) });

export const billingSummarySchema = z.object({
  plan: z.string(),
  usageLimit: z.number(),
  usedThisPeriod: z.number(),
  subscriptionStatus: z.string().nullable(),
  stripeConfigured: z.boolean(),
});

export const checkoutSessionBodySchema = z.object({
  workspaceId: z.string().min(1),
});

export const checkoutSessionResponseSchema = z.object({ url: z.string() });

export const portalSessionBodySchema = z.object({
  workspaceId: z.string().min(1),
});

export const portalSessionResponseSchema = z.object({ url: z.string() });
