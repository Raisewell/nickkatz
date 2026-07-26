import { Queue } from "bullmq";
import { Redis } from "ioredis";

let connection: Redis | undefined;

/** BullMQ requires this setting on its Redis connection (blocking commands
 * would otherwise time out mid-retry). */
function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export const THESIS_MATCH_QUEUE_NAME = "thesis-match-batch";

export interface ThesisMatchBatchJobData {
  queryHash: string;
  sectors: string[];
  keywords: string[];
  investorIds: string[];
}

let thesisMatchQueue: Queue<ThesisMatchBatchJobData> | undefined;

export function getThesisMatchQueue(): Queue<ThesisMatchBatchJobData> {
  if (!thesisMatchQueue) {
    thesisMatchQueue = new Queue<ThesisMatchBatchJobData>(THESIS_MATCH_QUEUE_NAME, {
      connection: getConnection(),
    });
  }
  return thesisMatchQueue;
}

const MAX_INVESTORS_PER_BATCH = 40;

/**
 * Enqueues one job per chunk of up to MAX_INVESTORS_PER_BATCH investors that
 * don't have a cached thesis_match score for this query hash yet. Chunk jobs
 * use a deterministic jobId (queryHash + chunk index) so re-running the same
 * search while a batch is still queued/active doesn't enqueue a duplicate -
 * idempotent by construction, not by a check-then-add race.
 */
export async function enqueueThesisMatchBatches(
  queryHash: string,
  context: { sectors: string[]; keywords: string[] },
  investorIds: string[]
): Promise<void> {
  if (investorIds.length === 0) return;

  const queue = getThesisMatchQueue();

  for (let i = 0; i < investorIds.length; i += MAX_INVESTORS_PER_BATCH) {
    const chunk = investorIds.slice(i, i + MAX_INVESTORS_PER_BATCH);
    await queue.add(
      "score-batch",
      { queryHash, sectors: context.sectors, keywords: context.keywords, investorIds: chunk },
      {
        jobId: `${queryHash}-${i / MAX_INVESTORS_PER_BATCH}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
  }
}

export async function closeThesisMatchQueue(): Promise<void> {
  await thesisMatchQueue?.close();
  await connection?.quit();
  thesisMatchQueue = undefined;
  connection = undefined;
}
