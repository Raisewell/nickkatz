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

export const workspaceMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(["OWNER", "ADVISOR", "MEMBER"]),
});

export const addMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADVISOR", "MEMBER"]).default("MEMBER"),
});

export const memberParamsSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});

