import { z } from "zod";

export const networkContactImportResponseSchema = z.object({
  detectedFormat: z.enum(["linkedin_import", "csv"]),
  rowsParsed: z.number(),
  contactsCreated: z.number(),
});

export const importNetworkContactsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});

export const warmPathSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  leadId: z.string().nullable(),
  targetContactId: z.string(),
  mutualName: z.string().nullable(),
  strengthScore: z.number().nullable(),
  verified: z.boolean(),
  createdAt: z.date(),
});

export const computeWarmPathsBodySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  leadId: z.string().min(1),
});

export const computeWarmPathsResponseSchema = z.object({ created: z.number() });

export const createManualWarmPathBodySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  leadId: z.string().min(1).optional(),
  targetContactId: z.string().min(1),
  mutualName: z.string().min(1),
  strengthScore: z.number().min(0).max(100).optional(),
});

export const listWarmPathsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  leadId: z.string().min(1),
});
