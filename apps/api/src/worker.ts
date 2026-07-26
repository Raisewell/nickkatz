import { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { startThesisMatchWorker } from "./jobs/thesis-match-worker.js";
import { startDiscoveryRunWorker, startDiscoveryApprovalWorker } from "./jobs/discovery-worker.js";
import { startWebhookWorker } from "./jobs/webhook-worker.js";

const prisma = new PrismaClient();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workers: Worker<any>[] = [
  startThesisMatchWorker(prisma),
  startDiscoveryRunWorker(prisma),
  startDiscoveryApprovalWorker(prisma),
  startWebhookWorker(),
];

console.log(
  "Raisely worker started (queues: thesis-match-batch, discovery-run, discovery-approval, webhook-delivery)"
);

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
