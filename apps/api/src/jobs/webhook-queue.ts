import { Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { getBullConnection } from "./connection.js";

export const WEBHOOK_QUEUE_NAME = "webhook-delivery";

export interface WebhookDeliveryJobData {
  endpointId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: unknown;
}

let webhookQueue: Queue<WebhookDeliveryJobData> | undefined;

export function getWebhookQueue(): Queue<WebhookDeliveryJobData> {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_QUEUE_NAME, { connection: getBullConnection() });
  }
  return webhookQueue;
}

/** Fans a single event out to every active webhook endpoint on the
 * workspace. Each delivery is its own job so one slow/broken endpoint's
 * retries don't hold up another's. */
export async function enqueueWebhookDeliveries(
  prisma: PrismaClient,
  workspaceId: string,
  eventType: string,
  payload: unknown
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { workspaceId, active: true } });
  if (endpoints.length === 0) return;

  const queue = getWebhookQueue();
  await Promise.all(
    endpoints.map((endpoint) =>
      queue.add(
        "deliver",
        { endpointId: endpoint.id, url: endpoint.url, secret: endpoint.secret, eventType, payload },
        { attempts: 5, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 200, removeOnFail: 200 }
      )
    )
  );
}

export async function closeWebhookQueue(): Promise<void> {
  await webhookQueue?.close();
  webhookQueue = undefined;
}
