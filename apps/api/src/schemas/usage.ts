import { z } from "zod";
import { workspaceAuthQuerySchema } from "./workspace-auth.js";

export const usageQuerySchema = workspaceAuthQuerySchema;

export const usageSummarySchema = z.object({
  limit: z.number(),
  used: z.number(),
  remaining: z.number(),
  periodStart: z.date(),
});
