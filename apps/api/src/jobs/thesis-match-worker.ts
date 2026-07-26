import { Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { getBullConnection } from "./connection.js";
import { THESIS_MATCH_QUEUE_NAME, type ThesisMatchBatchJobData } from "./thesis-match-queue.js";
import { scoreThesisMatchBatch } from "../services/thesis-match.js";

/**
 * Consumes batched thesis-match jobs: loads the requested investors' thesis
 * text and calls Claude once per job to score them all against the query's
 * sectors/keywords, then upserts the ThesisMatchScore cache. Idempotent -
 * safe to retry or run more than once for the same job, since scoring is a
 * pure function of (thesis text, query context) and writes are upserts.
 */
export function startThesisMatchWorker(prisma: PrismaClient): Worker<ThesisMatchBatchJobData> {
  const worker = new Worker<ThesisMatchBatchJobData>(
    THESIS_MATCH_QUEUE_NAME,
    async (job: Job<ThesisMatchBatchJobData>) => {
      const investors = await prisma.investor.findMany({
        where: { id: { in: job.data.investorIds } },
        select: { id: true, thesis: true },
      });

      await scoreThesisMatchBatch(
        prisma,
        investors,
        { sectors: job.data.sectors, keywords: job.data.keywords },
        job.data.queryHash
      );
    },
    { connection: getBullConnection() }
  );

  worker.on("failed", (job, err) => {
    console.error(`thesis-match job ${job?.id} failed:`, err);
  });

  return worker;
}
