import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { outreachDraftSchema, patchDraftBodySchema, draftIdParamsSchema } from "../schemas/leads.js";
import { updateOutreachDraft } from "../services/outreach-drafting.js";

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
      const existing = await fastify.prisma.outreachDraft.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      return updateOutreachDraft(fastify.prisma, request.params.id, request.body);
    }
  );
};

export default outreachDraftRoutes;
