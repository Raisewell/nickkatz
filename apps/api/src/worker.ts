import { PrismaClient } from "@prisma/client";
import { startThesisMatchWorker } from "./jobs/thesis-match-worker.js";

const prisma = new PrismaClient();
const worker = startThesisMatchWorker(prisma);

console.log("Raisely worker started (queues: thesis-match-batch)");

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
