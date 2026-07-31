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
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

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
    async (request, reply) => {
      const { workspaceId, leadId } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) return reply.notFound();

      const created = await computeWarmPathsForLead(db, { workspaceId, leadId });
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
      const { workspaceId, ...rest } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const warmPath = await createManualWarmPath(db, { workspaceId, ...rest });
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
      const { workspaceId, leadId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      return db.warmPath.findMany({
        where: { leadId },
        orderBy: [{ strengthScore: "desc" }, { createdAt: "desc" }],
      });
    }
  );
};

export default warmPathRoutes;
