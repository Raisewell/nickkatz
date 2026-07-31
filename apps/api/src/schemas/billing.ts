import { z } from "zod";
import { workspaceAuthQuerySchema } from "./workspace-auth.js";

export const billingSummaryQuerySchema = workspaceAuthQuerySchema;

export const billingSummarySchema = z.object({
  plan: z.string(),
  planLabel: z.string(),
  usageLimit: z.number(),
  subscriptionStatus: z.string().nullable(),
  currentPeriodEnd: z.date().nullable(),
  hasStripeCustomer: z.boolean(),
});

export const planOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  usageLimit: z.number(),
});

export const listPlansResponseSchema = z.object({
  plans: z.array(planOptionSchema),
});

export const checkoutBodySchema = z.object({
  workspaceId: z.string().min(1),
  plan: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const checkoutResponseSchema = z.object({
  url: z.string().url(),
});

export const portalBodySchema = z.object({
  workspaceId: z.string().min(1),
  returnUrl: z.string().url(),
});

export const portalResponseSchema = z.object({
  url: z.string().url(),
});
