import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { outreachDraftSchema, patchDraftBodySchema, draftIdParamsSchema } from "../schemas/leads.js";
import { updateOutreachDraft } from "../services/outreach-drafting.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

const outreachDraftRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.patch(
    "/:id",
    {
      schema: {
        summary: "Edit an outreach draft before sending it anywhere",
        params: draftIdParamsSchema,
        body: patchDraftBodySchema,
        response: { 200: outreachDraftSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, ...updates } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, request.user.id, reply);
      if (!db) return;

      const existing = await db.outreachDraft.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      return updateOutreachDraft(db, request.params.id, updates);
    }
  );
};

export default outreachDraftRoutes;
