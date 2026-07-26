import { z } from "zod";

export const workspaceIdParamsSchema = z.object({ id: z.string().min(1) });

/** GDPR endpoints are POST (not GET/DELETE) specifically so userId can travel in a body
 * rather than a query string - these are consequential actions, not idempotent reads. */
export const workspaceDataActionBodySchema = z.object({
  // TODO(auth): derive userId from the session once Auth.js is wired up (see the same TODO
  // in schemas/discovery.ts and searches.ts).
  userId: z.string().min(1),
});

export const exportResponseSchema = z.object({
  exportedAt: z.string(),
  // Deliberately loose (not a fully-typed nested schema) - this endpoint's job is to dump
  // everything a workspace owns for portability, and re-declaring every nested model's
  // shape here would just drift from schema.prisma as fields are added.
  workspace: z.record(z.string(), z.unknown()),
});

export const deleteResponseSchema = z.object({
  status: z.literal("deleted"),
  workspaceId: z.string(),
});
