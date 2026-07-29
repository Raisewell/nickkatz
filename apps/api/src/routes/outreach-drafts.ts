import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { outreachDraftSchema, patchDraftBodySchema, draftIdParamsSchema } from "../schemas/leads.js";
import { updateOutreachDraft } from "../services/outreach-drafting.js";
import { assertWorkspaceMember } from "../lib/authz.js";

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
      const existing = await fastify.prisma.outreachDraft.findUnique({
        where: { id: request.params.id },
        include: { lead: { select: { workspaceId: true } } },
      });
      if (!existing) return reply.notFound();
      await assertWorkspaceMember(fastify, request, existing.lead.workspaceId);
      return updateOutreachDraft(fastify.prisma, request.params.id, request.body);
    }
  );
};

export default outreachDraftRoutes;
