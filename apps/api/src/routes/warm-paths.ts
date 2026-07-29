import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  warmPathSchema,
  computeWarmPathsBodySchema,
  computeWarmPathsResponseSchema,
  createManualWarmPathBodySchema,
  listWarmPathsQuerySchema,
} from "../schemas/warm-paths.js";
import { computeWarmPathsForLead, createManualWarmPath } from "../services/warm-paths.js";
import { assertWorkspaceMember } from "../lib/authz.js";

const warmPathRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/compute",
    {
      schema: {
        summary:
          "Match a workspace's imported network contacts against a lead's investor contacts to find direct warm paths",
        body: computeWarmPathsBodySchema,
        response: { 200: computeWarmPathsResponseSchema },
      },
    },
    async (request) => {
      await assertWorkspaceMember(fastify, request, request.body.workspaceId);
      const created = await computeWarmPathsForLead(fastify.prisma, request.body);
      return { created };
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        summary: "Manually record a warm path (an intro route the founder already knows about)",
        body: createManualWarmPathBodySchema,
        response: { 201: warmPathSchema },
      },
    },
    async (request, reply) => {
      await assertWorkspaceMember(fastify, request, request.body.workspaceId);
      const warmPath = await createManualWarmPath(fastify.prisma, request.body);
      reply.code(201);
      return warmPath;
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        summary: "List warm paths for a lead, strongest first",
        querystring: listWarmPathsQuerySchema,
        response: { 200: z.array(warmPathSchema) },
      },
    },
    async (request, reply) => {
      const lead = await fastify.prisma.lead.findUnique({
        where: { id: request.query.leadId },
        select: { workspaceId: true },
      });
      if (!lead) return reply.notFound();
      await assertWorkspaceMember(fastify, request, lead.workspaceId);

      return fastify.prisma.warmPath.findMany({
        where: { leadId: request.query.leadId },
        orderBy: [{ strengthScore: "desc" }, { createdAt: "desc" }],
      });
    }
  );
};

export default warmPathRoutes;
