import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  refineQueryBodySchema,
  refineQueryResponseSchema,
  runSearchBodySchema,
  runSearchResponseSchema,
  listSearchesQuerySchema,
  searchListItemSchema,
  searchDetailResponseSchema,
  patchSearchBodySchema,
  searchSummarySchema,
  rerunSearchBodySchema,
  searchIdParamsSchema,
} from "../schemas/search.js";
import type { StructuredQueryValue } from "../schemas/structured-query.js";
import { refineQuery } from "../services/query-refiner.js";
import { runSearch } from "../services/search-execution.js";
import { getBestWarmPathsForLeads } from "../services/warm-paths.js";
import { tierSearchLeads } from "../services/lead-tiering.js";
import { tierSearchResponseSchema } from "../schemas/round-plan.js";

const searchRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/refine",
    {
      schema: {
        summary: "Parse free text into a StructuredQuery via Claude, for the user to edit before running",
        body: refineQueryBodySchema,
        response: { 200: refineQueryResponseSchema },
      },
    },
    async (request) => {
      const { query, usedFallback, error } = await refineQuery(request.body.text);
      return { query, usedFallback, warning: error };
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        summary:
          "Execute a search: natural-language (with queryText) or Firm Finder (structuredQuery built directly from filters)",
        body: runSearchBodySchema,
        response: { 200: runSearchResponseSchema },
      },
    },
    async (request) => {
      const body = request.body;
      return runSearch(fastify.prisma, {
        workspaceId: body.workspaceId,
        createdById: body.createdById,
        name: body.name,
        queryText: body.queryText,
        structuredQuery: body.structuredQuery,
        saved: body.saved,
        page: body.page,
        pageSize: body.pageSize,
      });
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        summary: "List searches for a workspace",
        querystring: listSearchesQuerySchema,
        response: { 200: z.array(searchListItemSchema) },
      },
    },
    async (request) => {
      const { workspaceId, saved } = request.query;
      const searches = await fastify.prisma.search.findMany({
        where: { workspaceId, ...(saved !== undefined ? { saved } : {}) },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { leads: true } } },
      });
      return searches.map((s) => ({
        id: s.id,
        name: s.name,
        queryText: s.queryText,
        structuredQuery: s.structuredQuery as StructuredQueryValue,
        status: s.status,
        saved: s.saved,
        excludedCount: s.excludedCount,
        createdAt: s.createdAt,
        leadCount: s._count.leads,
      }));
    }
  );

  fastify.get(
    "/:id",
    {
      schema: {
        summary: "Get a search with all of its leads, ranked by fit score",
        params: searchIdParamsSchema,
        response: { 200: searchDetailResponseSchema },
      },
    },
    async (request, reply) => {
      const search = await fastify.prisma.search.findUnique({
        where: { id: request.params.id },
        include: {
          leads: {
            orderBy: { fitScore: "desc" },
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
          },
        },
      });
      if (!search) return reply.notFound();

      const bestWarmPaths = await getBestWarmPathsForLeads(
        fastify.prisma,
        search.leads.map((l) => l.id)
      );

      return {
        search: {
          id: search.id,
          name: search.name,
          queryText: search.queryText,
          structuredQuery: search.structuredQuery as StructuredQueryValue,
          status: search.status,
          saved: search.saved,
          excludedCount: search.excludedCount,
          createdAt: search.createdAt,
        },
        leads: search.leads.map((lead) => {
          const bestWarmPath = bestWarmPaths.get(lead.id);
          return {
            id: lead.id,
            investorId: lead.investorId,
            investor: lead.investor,
            fitScore: lead.fitScore,
            fitReasons: lead.fitReasons as unknown as z.infer<typeof searchDetailResponseSchema>["leads"][number]["fitReasons"],
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
        }),
      };
    }
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        summary: "Rename a search or toggle its saved flag",
        params: searchIdParamsSchema,
        body: patchSearchBodySchema,
        response: { 200: searchSummarySchema },
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.search.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();

      const updated = await fastify.prisma.search.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.saved !== undefined ? { saved: request.body.saved } : {}),
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        queryText: updated.queryText,
        structuredQuery: updated.structuredQuery as StructuredQueryValue,
        status: updated.status,
        saved: updated.saved,
        excludedCount: updated.excludedCount,
        createdAt: updated.createdAt,
      };
    }
  );

  fastify.post(
    "/:id/rerun",
    {
      schema: {
        summary: "Re-run a saved search, creating a new Search row linked back to it",
        params: searchIdParamsSchema,
        body: rerunSearchBodySchema,
        response: { 200: runSearchResponseSchema },
      },
    },
    async (request, reply) => {
      const original = await fastify.prisma.search.findUnique({ where: { id: request.params.id } });
      if (!original) return reply.notFound();

      return runSearch(fastify.prisma, {
        workspaceId: original.workspaceId,
        createdById: request.body.createdById,
        name: original.name ?? undefined,
        queryText: original.queryText ?? undefined,
        structuredQuery: original.structuredQuery as StructuredQueryValue,
        saved: false,
        savedSearchId: original.id,
        page: request.body.page,
        pageSize: request.body.pageSize,
      });
    }
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a search (and its leads)",
        params: searchIdParamsSchema,
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.search.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      await fastify.prisma.search.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );

  fastify.post(
    "/:id/tier",
    {
      schema: {
        summary: "Auto-tier a search's leads A/B/C by fit-score percentile (top 20% / next 30% / rest)",
        params: searchIdParamsSchema,
        response: { 200: tierSearchResponseSchema },
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.search.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      return tierSearchLeads(fastify.prisma, request.params.id);
    }
  );
};

export default searchRoutes;
