import type { Prisma, PrismaClient } from "@prisma/client";
import type { UsageEventType } from "@raisely/shared-types";

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Sum of costUnits for every UsageEvent this workspace has logged since the
 * start of the current calendar month (UTC) - the metering period. */
export async function getCurrentPeriodUsage(prisma: PrismaClient, workspaceId: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: { workspaceId, createdAt: { gte: currentPeriodStart() } },
    _sum: { costUnits: true },
  });
  return result._sum.costUnits ?? 0;
}

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number
  ) {
    super(`Workspace has used ${used} of ${limit} units this period`);
  }
}

/** Throws UsageLimitExceededError if the workspace is already at or over its
 * plan's monthly usageLimit. Call this before starting a billable action
 * (a search, a discovery run, an outreach draft, an export) - the caller
 * decides how to surface that as an HTTP response. */
export async function assertUnderUsageLimit(prisma: PrismaClient, workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { usageLimit: true },
  });
  const used = await getCurrentPeriodUsage(prisma, workspaceId);
  if (used >= workspace.usageLimit) throw new UsageLimitExceededError(used, workspace.usageLimit);
}

export async function recordUsageEvent(
  prisma: PrismaClient,
  params: { workspaceId: string; userId?: string | null; type: UsageEventType; costUnits?: number; metadata?: Record<string, unknown> }
): Promise<void> {
  await prisma.usageEvent.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      type: params.type,
      costUnits: params.costUnits ?? 1,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
