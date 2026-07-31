import { z } from "zod";

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  ownerId: z.string(),
  plan: z.string(),
  companyOneLiner: z.string().nullable(),
});

export const createWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyOneLiner: z.string().min(1).max(500).optional(),
});
