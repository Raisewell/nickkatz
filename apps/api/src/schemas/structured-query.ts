import { z } from "zod";
import { INVESTOR_TYPES } from "@raisely/shared-types";

export const structuredQuerySchema = z.object({
  stages: z.array(z.string()).default([]),
  sectors: z.array(z.string()).default([]),
  geographies: z.array(z.string()).default([]),
  checkRange: z
    .object({
      min: z.number().nullable().default(null),
      max: z.number().nullable().default(null),
    })
    .default({ min: null, max: null }),
  investorTypes: z.array(z.enum(INVESTOR_TYPES)).default([]),
  keywords: z.array(z.string()).default([]),
  excludeCompetitorsOf: z.array(z.string()).optional(),
});

export type StructuredQueryValue = z.infer<typeof structuredQuerySchema>;
