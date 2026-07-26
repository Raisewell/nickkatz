import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { leadSchema } from "../schemas/search.js";
import {
  patchLeadBodySchema,
  leadIdParamsSchema,
  outreachDraftSchema,
  createDraftBodySchema,
  listLeadsQuerySchema,
  leadListItemSchema,
} from "../schemas/leads.js";
import { draftOutreach } from "../services/outreach-drafting.js";
import { getBestWarmPathsForLeads } from "../services/warm-paths.js";

const leadRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary:
          "List leads across all of a workspace's searches, optionally filtered by pipeline stage. Backs the Kanban pipeline board.",
        querystring: listLeadsQuerySchema,
        response: { 200: z.array(leadListItemSchema) },
      },
    },
    async (request) => {
      const { workspaceId, pipelineStage } = request.query;
      const leads = await fastify.prisma.lead.findMany({
        where: { workspaceId, ...(pipelineStage ? { pipelineStage } : {}) },
        orderBy: { updatedAt: "desc" },
        include: {
          search: { select: { id: true, name: true } },
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

      const bestWarmPaths = await getBestWarmPathsForLeads(
        fastify.prisma,
        leads.map((l) => l.id)
      );

      return leads.map((lead) => {
        const bestWarmPath = bestWarmPaths.get(lead.id);
        return {
          id: lead.id,
          investorId: lead.investorId,
          investor: lead.investor,
          fitScore: lead.fitScore,
          fitReasons: lead.fitReasons as unknown as z.infer<typeof leadSchema>["fitReasons"],
          tier: lead.tier,
          pipelineStage: lead.pipelineStage,
          tags: lead.tags,
          bestWarmPath: bestWarmPath
            ? {
                id: bestWarmPath.id,
                targetContactId: bestWarmPath.targetContactId,
                mutualName: bestWarmPath.mutualName,
                strengthScore: bestWarmPath.strengthScore,
                verified: bestWarmPath.verified,
              }
            : null,
          searchId: lead.search.id,
          searchName: lead.search.name,
        };
      });
    }
  );

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
