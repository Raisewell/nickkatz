import { z } from "zod";
import { PIPELINE_STAGES, LEAD_TIERS } from "@raisely/shared-types";
import { leadSchema } from "./search.js";

export const listLeadsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  pipelineStage: z.enum(PIPELINE_STAGES).optional(),
});

export const pipelineLeadSchema = leadSchema.extend({ searchId: z.string() });

export const patchLeadBodySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  pipelineStage: z.enum(PIPELINE_STAGES).optional(),
  tier: z.enum(LEAD_TIERS).optional(),
  tags: z.array(z.string()).optional(),
});

export const leadIdParamsSchema = z.object({ id: z.string().min(1) });

export const outreachDraftSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  firstLine: z.string(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createDraftBodySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  companyOneLiner: z.string().min(1).max(500).optional(),
});

export const listDraftsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});

export const patchDraftBodySchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  firstLine: z.string().min(1).max(400).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(2000).optional(),
});

export const draftIdParamsSchema = z.object({ id: z.string().min(1) });
