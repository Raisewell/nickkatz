import { Queue } from "bullmq";
import { getBullConnection } from "./connection.js";

export const DISCOVERY_RUN_QUEUE_NAME = "discovery-run";
export const DISCOVERY_APPROVAL_QUEUE_NAME = "discovery-approval";

export interface DiscoveryRunJobData {
  runId: string;
}

export interface DiscoveryApprovalJobData {
  runId: string;
}

let discoveryRunQueue: Queue<DiscoveryRunJobData> | undefined;
let discoveryApprovalQueue: Queue<DiscoveryApprovalJobData> | undefined;

export function getDiscoveryRunQueue(): Queue<DiscoveryRunJobData> {
  if (!discoveryRunQueue) {
    discoveryRunQueue = new Queue<DiscoveryRunJobData>(DISCOVERY_RUN_QUEUE_NAME, {
      connection: getBullConnection(),
    });
  }
  return discoveryRunQueue;
}

export function getDiscoveryApprovalQueue(): Queue<DiscoveryApprovalJobData> {
  if (!discoveryApprovalQueue) {
    discoveryApprovalQueue = new Queue<DiscoveryApprovalJobData>(DISCOVERY_APPROVAL_QUEUE_NAME, {
      connection: getBullConnection(),
    });
  }
  return discoveryApprovalQueue;
}

/** jobId = runId: a given run only ever needs one matching pass in flight
 * at a time, so re-enqueueing (e.g. a retried request) is a safe no-op. */
export async function enqueueDiscoveryRun(runId: string): Promise<void> {
  await getDiscoveryRunQueue().add(
    "process-run",
    { runId },
    { jobId: runId, attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 100, removeOnFail: 100 }
  );
}

export async function enqueueDiscoveryApproval(runId: string): Promise<void> {
  await getDiscoveryApprovalQueue().add(
    "process-approval",
    { runId },
    { jobId: runId, attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 100, removeOnFail: 100 }
  );
}

export async function closeDiscoveryQueues(): Promise<void> {
  await discoveryRunQueue?.close();
  await discoveryApprovalQueue?.close();
  discoveryRunQueue = undefined;
  discoveryApprovalQueue = undefined;
}
