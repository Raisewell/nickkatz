import { z } from "zod";
import { structuredQuerySchema } from "./structured-query.js";

export const refineQueryBodySchema = z.object({
  text: z.string().min(1).max(2000),
});

export const refineQueryResponseSchema = z.object({
  query: structuredQuerySchema,
  usedFallback: z.boolean(),
  warning: z.string().optional(),
});

export const runSearchBodySchema = z.object({
  // TODO(auth): derive workspaceId/createdById from the authenticated
  // session once Auth.js is wired up; accepted explicitly for now.
  workspaceId: z.string().min(1),
  createdById: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  queryText: z.string().max(2000).optional(),
  structuredQuery: structuredQuerySchema,
  saved: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const investorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  thesis: z.string().nullable(),
  sectors: z.array(z.string()),
  stages: z.array(z.string()),
  geographies: z.array(z.string()),
  checkMin: z.number().nullable(),
  checkMax: z.number().nullable(),
  website: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
});

export const fitScoreComponentSchema = z.object({
  factor: z.enum(["thesis_match", "stage_fit", "recent_activity", "geography", "freshness"]),
  points: z.number(),
  max: z.number(),
  evidence: z.string(),
  dealIds: z.array(z.string()).optional(),
});

export const fitFlagSchema = z.object({
  type: z.enum(["conflict", "info", "warning"]),
  detail: z.string(),
});

export const fitScoreResultSchema = z.object({
  score: z.number(),
  components: z.array(fitScoreComponentSchema),
  flags: z.array(fitFlagSchema),
});

export const bestWarmPathSchema = z.object({
  id: z.string(),
  targetContactId: z.string(),
  mutualName: z.string().nullable(),
  strengthScore: z.number().nullable(),
  verified: z.boolean(),
});

export const leadSchema = z.object({
  id: z.string(),
  investorId: z.string(),
  investor: investorSummarySchema,
  fitScore: z.number().nullable(),
  fitReasons: fitScoreResultSchema.nullable(),
  tier: z.enum(["A", "B", "C"]).nullable(),
  pipelineStage: z.string(),
  tags: z.array(z.string()),
  bestWarmPath: bestWarmPathSchema.nullable().optional(),
});

export const searchSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  queryText: z.string().nullable(),
  structuredQuery: structuredQuerySchema,
  status: z.string(),
  saved: z.boolean(),
  excludedCount: z.number(),
  createdAt: z.date(),
});

export const runSearchResponseSchema = z.object({
  search: searchSummarySchema,
  results: z.array(leadSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
  excludedCount: z.number(),
});

export const searchDetailResponseSchema = z.object({
  search: searchSummarySchema,
  leads: z.array(leadSchema),
});

export const listSearchesQuerySchema = z.object({
  workspaceId: z.string().min(1),
  saved: z.coerce.boolean().optional(),
});

export const searchListItemSchema = searchSummarySchema.extend({
  leadCount: z.number(),
});

export const patchSearchBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  saved: z.boolean().optional(),
});

export const rerunSearchBodySchema = z.object({
  createdById: z.string().min(1),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const searchIdParamsSchema = z.object({ id: z.string().min(1) });
