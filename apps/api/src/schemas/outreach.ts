import { z } from "zod";

export const outreachDestinationSchema = z.object({
  key: z.string(),
  name: z.string(),
  implemented: z.boolean(),
});

export const exportOutreachBodySchema = z.object({
  workspaceId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(1000),
});

export const sendOutreachBodySchema = z.object({
  workspaceId: z.string().min(1),
  destination: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(1000),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const outreachSendResultSchema = z.object({
  destination: z.string(),
  succeeded: z.number(),
  failed: z.number(),
  details: z.string().optional(),
});
