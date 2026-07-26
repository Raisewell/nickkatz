import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { leadSchema } from "../schemas/search.js";
import {
  patchLeadBodySchema,
  leadIdParamsSchema,
  outreachDraftSchema,
  createDraftBodySchema,
} from "../schemas/leads.js";
import { draftOutreach } from "../services/outreach-drafting.js";

const leadRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.patch(
    "/:id",
    {
      schema: {
        summary: "Update a lead's pipeline stage, tier, or tags (drives the Kanban board)",
        params: leadIdParamsSchema,
        body: patchLeadBodySchema,
        response: { 200: leadSchema },
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.lead.findUnique({
        where: { id: request.params.id },
        include: { investor: true },
      });
      if (!existing) return reply.notFound();

      const updated = await fastify.prisma.lead.update({
        where: { id: request.params.id },
        data: request.body,
        include: {
          investor: {
            select: {
              id: true,
              name: true,
              type: true,
              thesis: true,
              sectors: true,
              stages: true,
              geographies: true,
              checkMin: true,
              checkMax: true,
              website: true,
              linkedinUrl: true,
            },
          },
        },
      });

      return {
        id: updated.id,
        investorId: updated.investorId,
        investor: updated.investor,
        fitScore: updated.fitScore,
        fitReasons: updated.fitReasons as unknown as z.infer<typeof leadSchema>["fitReasons"],
        tier: updated.tier,
        pipelineStage: updated.pipelineStage,
        tags: updated.tags,
      };
    }
  );

  fastify.post(
    "/:id/draft",
    {
      schema: {
        summary:
          "Draft a personalized outreach first line + email for a lead via Claude, using its fit evidence. Never sends anything - the draft is returned for the user to review and edit.",
        params: leadIdParamsSchema,
        body: createDraftBodySchema,
        response: { 201: outreachDraftSchema },
      },
    },
    async (request, reply) => {
      const lead = await fastify.prisma.lead.findUnique({ where: { id: request.params.id } });
      if (!lead) return reply.notFound();

      const draft = await draftOutreach(fastify.prisma, {
        leadId: request.params.id,
        companyOneLiner: request.body.companyOneLiner,
      });
      reply.code(201);
      return draft;
    }
  );

  fastify.get(
    "/:id/drafts",
    {
      schema: {
        summary: "List outreach drafts for a lead, most recent first",
        params: leadIdParamsSchema,
        response: { 200: z.array(outreachDraftSchema) },
      },
    },
    async (request) => {
      return fastify.prisma.outreachDraft.findMany({
        where: { leadId: request.params.id },
        orderBy: { createdAt: "desc" },
      });
    }
  );
};

export default leadRoutes;
