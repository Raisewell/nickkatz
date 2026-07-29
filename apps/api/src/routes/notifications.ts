import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  notificationSchema,
  listNotificationsQuerySchema,
  streamNotificationsQuerySchema,
  notificationIdParamsSchema,
} from "../schemas/notifications.js";
import { notificationChannel } from "../services/notifications.js";
import { createRedisSubscriber } from "../lib/redis.js";
import { assertWorkspaceMember } from "../lib/authz.js";

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
    async (request) => {
      const { workspaceId, unreadOnly } = request.query;
      await assertWorkspaceMember(fastify, request, workspaceId);
      const notifications = await fastify.prisma.notification.findMany({
        where: { workspaceId, ...(unreadOnly ? { readAt: null } : {}) },
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
        response: { 200: notificationSchema },
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.notification.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      await assertWorkspaceMember(fastify, request, existing.workspaceId);
      const updated = await fastify.prisma.notification.update({
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
      await assertWorkspaceMember(fastify, request, workspaceId);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
