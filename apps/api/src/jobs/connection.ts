import { Redis } from "ioredis";

let connection: Redis | undefined;

/** Shared BullMQ Redis connection (all our queues/workers reuse one - BullMQ
 * supports this and it avoids opening a connection per queue). Requires
 * maxRetriesPerRequest: null per BullMQ's docs, otherwise blocking commands
 * used internally by Worker can time out mid-retry. */
export function getBullConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export async function closeBullConnection(): Promise<void> {
  await connection?.quit();
  connection = undefined;
}
