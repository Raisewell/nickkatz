import type { DiscoveryRunStatus, PrismaClient, Prisma } from "@prisma/client";
import type { DiscoveryPreview } from "@raisely/shared-types";
import { findLookalikeCandidates } from "./discovery-matching.js";
import { runSearch } from "./search-execution.js";
import { notifyWorkspace } from "./notifications.js";
import { enqueueDiscoveryApproval, enqueueDiscoveryRun } from "../jobs/discovery-queue.js";

export class DiscoveryRunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryRunStateError";
  }
}

export class DiscoveryRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Discovery run ${runId} not found`);
    this.name = "DiscoveryRunNotFoundError";
  }
}

export class DiscoveryRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryRunValidationError";
  }
}

async function transitionStatus(prisma: PrismaClient, runId: string, status: DiscoveryRunStatus) {
  const updated = await prisma.discoveryRun.update({ where: { id: runId }, data: { status } });
  await notifyWorkspace(prisma, {
    workspaceId: updated.workspaceId,
    userId: updated.createdById,
    type: "DISCOVERY_RUN_STATUS_CHANGED",
    payload: { runId: updated.id, status: updated.status },
  });
  return updated;
}

export interface CreateDiscoveryRunParams {
  workspaceId: string;
  createdById: string;
  comparableCompanies: string[];
}

/** Creates the run (status QUEUED, notified immediately) and enqueues the
 * background matching job. Returns right away - matching happens async. */
export async function createDiscoveryRun(prisma: PrismaClient, params: CreateDiscoveryRunParams) {
  const run = await prisma.discoveryRun.create({
    data: {
      workspaceId: params.workspaceId,
      createdById: params.createdById,
      comparableCompanies: params.comparableCompanies,
      status: "QUEUED",
    },
  });

  await notifyWorkspace(prisma, {
    workspaceId: run.workspaceId,
    userId: run.createdById,
    type: "DISCOVERY_RUN_STATUS_CHANGED",
    payload: { runId: run.id, status: run.status },
  });

  try {
    await enqueueDiscoveryRun(run.id);
  } catch (err) {
    console.error(`Failed to enqueue discovery run ${run.id}:`, err);
  }

  return run;
}

/** The background job body for matching: QUEUED -> RUNNING -> (preview
 * results set) -> AWAITING_APPROVAL, or FAILED with the error recorded.
 * Idempotent: a run that isn't QUEUED anymore (already picked up, or a
 * stale retry) is a no-op rather than redoing work or double-transitioning. */
export async function processDiscoveryRun(prisma: PrismaClient, runId: string): Promise<void> {
  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "QUEUED") return;

  await transitionStatus(prisma, runId, "RUNNING");

  try {
    const preview = await findLookalikeCandidates(prisma, run.comparableCompanies);
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: { previewResults: preview as unknown as Prisma.InputJsonValue },
    });
    await transitionStatus(prisma, runId, "AWAITING_APPROVAL");
  } catch (err) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: { error: err instanceof Error ? err.message : "Unknown error during discovery matching" },
    });
    await transitionStatus(prisma, runId, "FAILED");
  }
}

export interface ApproveDiscoveryRunParams {
  approvedInvestorIds: string[];
}

/** AWAITING_APPROVAL -> APPROVED. Stashes the approved investor ids into
 * previewResults (the only place we have to put run-specific state the
 * approval job needs, short of a schema change) and enqueues the
 * enrichment+merge job. */
export async function approveDiscoveryRun(prisma: PrismaClient, runId: string, params: ApproveDiscoveryRunParams) {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new DiscoveryRunNotFoundError(runId);
  }
  if (run.status !== "AWAITING_APPROVAL") {
    throw new DiscoveryRunStateError(
      `Cannot approve discovery run ${runId}: status is ${run.status}, expected AWAITING_APPROVAL`
    );
  }

  const preview = (run.previewResults ?? { candidates: [], inferredSectors: [], generatedAt: new Date().toISOString() }) as unknown as DiscoveryPreview;
  const candidateIds = new Set(preview.candidates.map((c) => c.investorId));
  const invalidIds = params.approvedInvestorIds.filter((id) => !candidateIds.has(id));
  if (invalidIds.length > 0) {
    throw new DiscoveryRunValidationError(
      `approvedInvestorIds contains ids not present in this run's preview candidates: ${invalidIds.join(", ")}`
    );
  }

  const updatedPreview: DiscoveryPreview = { ...preview, approvedInvestorIds: params.approvedInvestorIds };
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { previewResults: updatedPreview as unknown as Prisma.InputJsonValue },
  });

  const updated = await transitionStatus(prisma, runId, "APPROVED");

  try {
    await enqueueDiscoveryApproval(runId);
  } catch (err) {
    console.error(`Failed to enqueue discovery approval ${runId}:`, err);
  }

  return updated;
}

/** The background job body for approval: APPROVED -> (enrichment run for
 * each approved investor, approved investors merged into a new Search) ->
 * COMPLETE, or FAILED with the error recorded. Idempotent for the same
 * reason as processDiscoveryRun. */
export async function processDiscoveryApproval(prisma: PrismaClient, runId: string): Promise<void> {
  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "APPROVED") return;

  try {
    const preview = run.previewResults as unknown as DiscoveryPreview;
    const approvedInvestorIds = preview.approvedInvestorIds ?? [];

    // Enrichment of approved firms. There's no real external data provider
    // wired up yet (Clearbit/PitchBook/etc - a follow-up integration); this
    // demonstrates the EnrichmentJob status machine so the pipeline and UI
    // have something real to build against.
    for (const investorId of approvedInvestorIds) {
      const job = await prisma.enrichmentJob.create({
        data: { workspaceId: run.workspaceId, investorId, status: "RUNNING", startedAt: new Date() },
      });
      await prisma.enrichmentJob.update({
        where: { id: job.id },
        data: { status: "COMPLETE", completedAt: new Date() },
      });
    }

    let resultSearchId: string | null = null;
    if (approvedInvestorIds.length > 0) {
      const { search } = await runSearch(prisma, {
        workspaceId: run.workspaceId,
        createdById: run.createdById,
        name: `Lookalikes: ${run.comparableCompanies.join(", ")}`,
        structuredQuery: {
          stages: [],
          sectors: preview.inferredSectors,
          geographies: [],
          checkRange: { min: null, max: null },
          investorTypes: [],
          keywords: [],
        },
        investorIdsOverride: approvedInvestorIds,
        saved: true,
      });
      resultSearchId = search.id;
    }

    await prisma.discoveryRun.update({ where: { id: runId }, data: { resultSearchId } });
    await transitionStatus(prisma, runId, "COMPLETE");
  } catch (err) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: { error: err instanceof Error ? err.message : "Unknown error during discovery approval" },
    });
    await transitionStatus(prisma, runId, "FAILED");
  }
}
