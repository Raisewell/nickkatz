import { z } from "zod";

export const roundPlanBodySchema = z.object({
  stage: z.string().min(1),
  roundSizeUsd: z.number().positive(),
});

export const roundPlanResponseSchema = z.object({
  stage: z.string(),
  roundSizeUsd: z.number(),
  targetListSize: z.object({ min: z.number(), max: z.number(), recommended: z.number() }),
  rationale: z.string(),
});

export const tierSearchResponseSchema = z.object({
  tiered: z.number(),
  thresholds: z.object({ a: z.number(), b: z.number() }),
});
