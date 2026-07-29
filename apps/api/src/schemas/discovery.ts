import { z } from "zod";

export const discoveryPreviewCandidateSchema = z.object({
  investorId: z.string(),
  investorName: z.string(),
  matchType: z.enum(["direct", "co_investment"]),
  score: z.number(),
  reason: z.string(),
  matchedCompanies: z.array(z.string()),
});

export const discoveryPreviewSchema = z.object({
  candidates: z.array(discoveryPreviewCandidateSchema),
  inferredSectors: z.array(z.string()),
  generatedAt: z.string(),
  approvedInvestorIds: z.array(z.string()).optional(),
});

export const createDiscoveryRunBodySchema = z.object({
  workspaceId: z.string().min(1),
  comparableCompanies: z.array(z.string().min(1)).min(3).max(10),
});

export const discoveryRunSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  createdById: z.string(),
  comparableCompanies: z.array(z.string()),
  status: z.string(),
  previewResults: discoveryPreviewSchema.nullable(),
  resultSearchId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listDiscoveryRunsQuerySchema = z.object({ workspaceId: z.string().min(1) });

export const approveDiscoveryRunBodySchema = z.object({
  approvedInvestorIds: z.array(z.string().min(1)).min(1),
});

export const discoveryRunIdParamsSchema = z.object({ id: z.string().min(1) });
