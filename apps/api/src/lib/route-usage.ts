import type { FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  recordUsageIfAllowed,
  UsageLimitExceededError,
  WorkspaceNotFoundForUsageError,
  type RecordUsageParams,
} from "../services/usage.js";

/**
 * Metering gate for routes that perform a billable action. Records the
 * UsageEvent (atomically, against the workspace's plan limit - see
 * recordUsageIfAllowed) and returns true if the caller should proceed, or
 * replies 402/404 and returns false if not. Call this AFTER the
 * membership/workspace-scope check and BEFORE doing the actual (often
 * expensive - Claude calls, enrichment) work, so a workspace over its
 * limit is rejected before any cost is incurred.
 */
export async function recordUsageOrReject(
  prisma: PrismaClient,
  params: RecordUsageParams,
  reply: FastifyReply
): Promise<boolean> {
  try {
    await recordUsageIfAllowed(prisma, params);
    return true;
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      reply.paymentRequired(err.message);
      return false;
    }
    if (err instanceof WorkspaceNotFoundForUsageError) {
      reply.notFound(err.message);
      return false;
    }
    throw err;
  }
}
