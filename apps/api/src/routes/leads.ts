import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { leadSchema } from "../schemas/search.js";
import {
  patchLeadBodySchema,
  leadIdParamsSchema,
  outreachDraftSchema,
  createDraftBodySchema,
  listDraftsQuerySchema,
  listLeadsQuerySchema,
  pipelineLeadSchema,
} from "../schemas/leads.js";
import { draftOutreach } from "../services/outreach-drafting.js";
import { getBestWarmPathsForLeads } from "../services/warm-paths.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";
import { recordUsageOrReject } from "../lib/route-usage.js";

const leadRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "List every lead across a workspace's searches, for the pipeline board",
        querystring: listLeadsQuerySchema,
        response: { 200: z.array(pipelineLeadSchema) },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId, pipelineStage } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const leads = await db.lead.findMany({
        where: { ...(pipelineStage ? { pipelineStage } : {}) },
        orderBy: { fitScore: "desc" },
        // runSearch persists a Lead row for every scored candidate (so
        // re-paging a search doesn't need to re-score), not just the page a
        // search response returns - that can be hundreds per search. The
        // pipeline board renders every row it gets, so this caps it to the
        // best-fit leads rather than trying to render them all at once.
        take: 200,
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

      const bestWarmPaths = await getBestWarmPathsForLeads(
        db,
        leads.map((l) => l.id)
      );

      return leads.map((lead) => {
        const bestWarmPath = bestWarmPaths.get(lead.id);
        return {
          id: lead.id,
          searchId: lead.searchId,
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
      const { workspaceId, userId, ...updates } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const existing = await db.lead.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();

      const updated = await db.lead.update({
        where: { id: request.params.id },
        data: updates,
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
      const { workspaceId, userId, companyOneLiner } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const lead = await db.lead.findUnique({ where: { id: request.params.id } });
      if (!lead) return reply.notFound();

      const allowed = await recordUsageOrReject(db, { workspaceId, userId, type: "OUTREACH_DRAFT" }, reply);
      if (!allowed) return;

      const draft = await draftOutreach(db, { leadId: request.params.id, companyOneLiner });
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
        querystring: listDraftsQuerySchema,
        response: { 200: z.array(outreachDraftSchema) },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const lead = await db.lead.findUnique({ where: { id: request.params.id } });
      if (!lead) return reply.notFound();

      return db.outreachDraft.findMany({
        where: { leadId: request.params.id },
        orderBy: { createdAt: "desc" },
      });
    }
  );
};

export default leadRoutes;
