import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  deleteResponseSchema,
  exportResponseSchema,
  workspaceDataActionBodySchema,
  workspaceIdParamsSchema,
} from "../schemas/workspace-data.js";
import { deleteWorkspace, exportWorkspaceData } from "../services/workspace-data.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

const workspaceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/:id/export",
    {
      schema: {
        summary: "GDPR/CCPA data portability: export everything this workspace owns (excludes webhook secrets)",
        params: workspaceIdParamsSchema,
        body: workspaceDataActionBodySchema,
        response: { 200: exportResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { userId } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, id, userId, reply);
      if (!db) return;

      return exportWorkspaceData(db, id);
    }
  );

  fastify.post(
    "/:id/delete-request",
    {
      schema: {
        summary:
          "GDPR/CCPA right to erasure: permanently delete this workspace and everything it owns. Irreversible - restricted to the workspace owner, not just any member.",
        params: workspaceIdParamsSchema,
        body: workspaceDataActionBodySchema,
        response: { 200: deleteResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { userId } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, id, userId, reply);
      if (!db) return;

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
      if (workspace.ownerId !== userId) {
        return reply.forbidden("Only the workspace owner can delete this workspace");
      }

      await deleteWorkspace(fastify.prisma, id);
      return { status: "deleted" as const, workspaceId: id };
    }
  );
};

export default workspaceRoutes;
