import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  notificationSchema,
  listNotificationsQuerySchema,
  streamNotificationsQuerySchema,
  notificationIdParamsSchema,
  markNotificationReadQuerySchema,
} from "../schemas/notifications.js";
import { notificationChannel } from "../services/notifications.js";
import { createRedisSubscriber } from "../lib/redis.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";
import { assertWorkspaceMembership, WorkspaceForbiddenError, WorkspaceNotFoundError } from "../lib/workspace-auth.js";

const HEARTBEAT_INTERVAL_MS = 25_000;

const notificationRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "List recent notifications for a workspace",
        querystring: listNotificationsQuerySchema,
        response: { 200: z.array(notificationSchema) },
      },
    },
    async (request, reply) => {
      const { workspaceId, unreadOnly } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const notifications = await db.notification.findMany({
        where: { ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return notifications as unknown as z.infer<typeof notificationSchema>[];
    }
  );

  fastify.post(
    "/:id/read",
    {
      schema: {
        summary: "Mark a notification as read",
        params: notificationIdParamsSchema,
        querystring: markNotificationReadQuerySchema,
        response: { 200: notificationSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const existing = await db.notification.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      const updated = await db.notification.update({
        where: { id: request.params.id },
        data: { readAt: new Date() },
      });
      return updated as unknown as z.infer<typeof notificationSchema>;
    }
  );

  fastify.get(
    "/stream",
    {
      schema: {
        summary:
          "Server-sent events stream of live notifications for a workspace - no polling required. Emits an `event: notification` frame per new notification.",
        querystring: streamNotificationsQuerySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;

      try {
        await assertWorkspaceMembership(fastify.prisma, workspaceId, request.user.id);
      } catch (err) {
        if (err instanceof WorkspaceNotFoundError) return reply.notFound(err.message);
        if (err instanceof WorkspaceForbiddenError) return reply.forbidden(err.message);
        throw err;
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        // hijack() bypasses Fastify's onSend hooks, so @fastify/cors never gets
        // a chance to set Access-Control-Allow-Origin on this response - set it
        // by hand or every cross-origin EventSource/fetch consumer gets blocked.
        "Access-Control-Allow-Origin": request.headers.origin ?? "*",
      });
      reply.raw.write(`event: connected\ndata: {}\n\n`);

      const subscriber = createRedisSubscriber();
      await subscriber.subscribe(notificationChannel(workspaceId));
      subscriber.on("message", (_channel, message) => {
        reply.raw.write(`event: notification\ndata: ${message}\n\n`);
      });

      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        subscriber.disconnect();
      };

      request.raw.on("close", cleanup);
      reply.raw.on("error", cleanup);
    }
  );
};

export default notificationRoutes;
