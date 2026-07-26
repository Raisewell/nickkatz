import type { Prisma, PrismaClient, UsageEventType } from "@prisma/client";

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(`Workspace ${workspaceId} has used ${used}/${limit} metered actions this period`);
    this.name = "UsageLimitExceededError";
  }
}

export class WorkspaceNotFoundForUsageError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace ${workspaceId} not found`);
    this.name = "WorkspaceNotFoundForUsageError";
  }
}

export interface RecordUsageParams {
  workspaceId: string;
  userId?: string | null;
  type: UsageEventType;
  costUnits?: number;
  metadata?: Record<string, unknown>;
}

function startOfCurrentPeriod(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Atomically checks a workspace's metered usage for the current billing
 * period (calendar month) against its plan's usageLimit, and records the
 * UsageEvent only if there's room - all inside one transaction that takes a
 * row lock (`SELECT ... FOR UPDATE`) on the Workspace row first. Without
 * that lock, two concurrent requests could both read "1 unit of headroom
 * left," both pass the check, and both insert - a classic check-then-act
 * TOCTOU race that would let a workspace overshoot its limit under
 * concurrency. The lock serializes concurrent callers for the *same*
 * workspace only; unrelated workspaces aren't affected.
 *
 * Uses $queryRaw for the lock because Prisma has no query-builder API for
 * SELECT ... FOR UPDATE; this deliberately bypasses the workspace-scoping
 * Prisma extension (Workspace itself isn't a scoped model - it's the
 * tenant boundary, not a resource inside one), which is fine since the
 * workspaceId here is the one the caller already had membership-checked
 * before reaching this function.
 */
export async function recordUsageIfAllowed(prisma: PrismaClient, params: RecordUsageParams) {
  const costUnits = params.costUnits ?? 1;
  const periodStart = startOfCurrentPeriod(new Date());

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ usageLimit: number }[]>`
      SELECT "usageLimit" FROM workspaces WHERE id = ${params.workspaceId} FOR UPDATE
    `;
    const workspace = rows[0];
    if (!workspace) throw new WorkspaceNotFoundForUsageError(params.workspaceId);

    const usedAgg = await tx.usageEvent.aggregate({
      where: { workspaceId: params.workspaceId, createdAt: { gte: periodStart } },
      _sum: { costUnits: true },
    });
    const used = usedAgg._sum.costUnits ?? 0;

    if (used + costUnits > workspace.usageLimit) {
      throw new UsageLimitExceededError(params.workspaceId, workspace.usageLimit, used);
    }

    return tx.usageEvent.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId ?? undefined,
        type: params.type,
        costUnits,
        metadata: params.metadata as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  });
}

export interface UsageSummary {
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
}

export async function getUsageSummary(prisma: PrismaClient, workspaceId: string): Promise<UsageSummary> {
  const periodStart = startOfCurrentPeriod(new Date());

  const [workspace, usedAgg] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { usageLimit: true } }),
    prisma.usageEvent.aggregate({
      where: { workspaceId, createdAt: { gte: periodStart } },
      _sum: { costUnits: true },
    }),
  ]);

  const used = usedAgg._sum.costUnits ?? 0;
  return { limit: workspace.usageLimit, used, remaining: Math.max(0, workspace.usageLimit - used), periodStart };
}
