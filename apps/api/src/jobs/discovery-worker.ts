import { Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { getBullConnection } from "./connection.js";
import {
  DISCOVERY_RUN_QUEUE_NAME,
  DISCOVERY_APPROVAL_QUEUE_NAME,
  type DiscoveryRunJobData,
  type DiscoveryApprovalJobData,
} from "./discovery-queue.js";
import { processDiscoveryRun, processDiscoveryApproval } from "../services/discovery.js";

export function startDiscoveryRunWorker(prisma: PrismaClient): Worker<DiscoveryRunJobData> {
  const worker = new Worker<DiscoveryRunJobData>(
    DISCOVERY_RUN_QUEUE_NAME,
    async (job: Job<DiscoveryRunJobData>) => {
      await processDiscoveryRun(prisma, job.data.runId);
    },
    { connection: getBullConnection() }
  );

  worker.on("failed", (job, err) => {
    console.error(`discovery-run job ${job?.id} failed:`, err);
  });

  return worker;
}

export function startDiscoveryApprovalWorker(prisma: PrismaClient): Worker<DiscoveryApprovalJobData> {
  const worker = new Worker<DiscoveryApprovalJobData>(
    DISCOVERY_APPROVAL_QUEUE_NAME,
    async (job: Job<DiscoveryApprovalJobData>) => {
      await processDiscoveryApproval(prisma, job.data.runId);
    },
    { connection: getBullConnection() }
  );

  worker.on("failed", (job, err) => {
    console.error(`discovery-approval job ${job?.id} failed:`, err);
  });

  return worker;
}
