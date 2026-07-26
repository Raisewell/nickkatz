import { z } from "zod";

export const devSessionBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  workspaceName: z.string().min(1).max(200).optional(),
  companyOneLiner: z.string().min(1).max(500).optional(),
});

export const devSessionResponseSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  companyOneLiner: z.string().nullable(),
});
