import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usageQuerySchema, usageSummarySchema } from "../schemas/usage.js";
import { getUsageSummary } from "../services/usage.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

const usageRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "Metered usage for the current billing period (calendar month) against the workspace's plan limit",
        querystring: usageQuerySchema,
        response: { 200: usageSummarySchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      return getUsageSummary(db, workspaceId);
    }
  );
};

export default usageRoutes;
