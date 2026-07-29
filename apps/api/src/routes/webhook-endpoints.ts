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
import { assertWorkspaceMember } from "../lib/authz.js";

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
      await assertWorkspaceMember(fastify, request, request.body.workspaceId);
      const endpoint = await fastify.prisma.webhookEndpoint.create({
        data: { workspaceId: request.body.workspaceId, url: request.body.url, secret: generateSecret() },
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
    async (request) => {
      await assertWorkspaceMember(fastify, request, request.query.workspaceId);
      return fastify.prisma.webhookEndpoint.findMany({
        where: { workspaceId: request.query.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a webhook endpoint",
        params: webhookEndpointIdParamsSchema,
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.webhookEndpoint.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      await assertWorkspaceMember(fastify, request, existing.workspaceId);
      await fastify.prisma.webhookEndpoint.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );
};

export default webhookEndpointRoutes;
