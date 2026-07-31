import { randomBytes } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createWebhookEndpointBodySchema,
  webhookEndpointSchema,
  webhookEndpointWithSecretSchema,
  listWebhookEndpointsQuerySchema,
  webhookEndpointIdParamsSchema,
} from "../schemas/webhooks.js";
import { workspaceAuthQuerySchema } from "../schemas/workspace-auth.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

const webhookEndpointRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        summary: "Register a webhook endpoint for a workspace. The signing secret is returned once, here only.",
        body: createWebhookEndpointBodySchema,
        response: { 201: webhookEndpointWithSecretSchema },
      },
    },
    async (request, reply) => {
      const db = await scopedPrismaOrReject(fastify.prisma, request.body.workspaceId, request.user.id, reply);
      if (!db) return;

      const endpoint = await db.webhookEndpoint.create({
        data: { url: request.body.url, secret: generateSecret() } as never,
      });
      reply.code(201);
      return endpoint;
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        summary: "List a workspace's webhook endpoints (secrets are never re-displayed)",
        querystring: listWebhookEndpointsQuerySchema,
        response: { 200: z.array(webhookEndpointSchema) },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      return db.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } });
    }
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a webhook endpoint",
        params: webhookEndpointIdParamsSchema,
        querystring: workspaceAuthQuerySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const existing = await db.webhookEndpoint.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      await db.webhookEndpoint.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );
};

export default webhookEndpointRoutes;
