import { Redis } from "ioredis";

let publisher: Redis | undefined;

/** Shared connection for publishing to Redis pub/sub channels (notifications).
 * Subscribers (SSE connections) each need their own dedicated connection -
 * ioredis can't multiplex SUBSCRIBE with regular commands on one connection -
 * so this singleton is publish-only. */
export function getRedisPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return publisher;
}

export function createRedisSubscriber(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export async function closeRedisPublisher(): Promise<void> {
  await publisher?.quit();
  publisher = undefined;
}
