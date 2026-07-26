import { z } from "zod";

export const createWebhookEndpointBodySchema = z.object({
  workspaceId: z.string().min(1),
  url: z.string().url(),
});

export const webhookEndpointSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  url: z.string(),
  active: z.boolean(),
  createdAt: z.date(),
});

// Returned only once, at creation - never re-displayed after (Stripe-style).
export const webhookEndpointWithSecretSchema = webhookEndpointSchema.extend({ secret: z.string() });

export const listWebhookEndpointsQuerySchema = z.object({ workspaceId: z.string().min(1) });

export const webhookEndpointIdParamsSchema = z.object({ id: z.string().min(1) });
