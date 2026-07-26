import type { NotificationType, PrismaClient, Prisma } from "@prisma/client";
import { getRedisPublisher } from "../lib/redis.js";
import { enqueueWebhookDeliveries } from "../jobs/webhook-queue.js";

export function notificationChannel(workspaceId: string): string {
  return `notifications:${workspaceId}`;
}

export interface NotifyParams {
  workspaceId: string;
  userId?: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
}

/**
 * Persists an in-app Notification row, publishes it to the workspace's Redis
 * pub/sub channel for any live SSE subscribers (no polling required), and
 * fans it out to the workspace's active webhook endpoints. Never throws -
 * publishing/webhook delivery are best-effort side channels, and a failure
 * there shouldn't take down the status transition that triggered it.
 */
export async function notifyWorkspace(prisma: PrismaClient, params: NotifyParams) {
  const notification = await prisma.notification.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      type: params.type,
      payload: params.payload as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    await getRedisPublisher().publish(notificationChannel(params.workspaceId), JSON.stringify(notification));
  } catch (err) {
    console.error("Failed to publish notification to Redis:", err);
  }

  try {
    await enqueueWebhookDeliveries(prisma, params.workspaceId, params.type, params.payload);
  } catch (err) {
    console.error("Failed to enqueue webhook deliveries:", err);
  }

  return notification;
}
