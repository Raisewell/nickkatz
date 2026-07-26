import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createDiscoveryRunBodySchema,
  discoveryRunSummarySchema,
  listDiscoveryRunsQuerySchema,
  approveDiscoveryRunBodySchema,
  discoveryRunIdParamsSchema,
} from "../schemas/discovery.js";
import { workspaceAuthQuerySchema } from "../schemas/workspace-auth.js";
import type { DiscoveryPreview } from "@raisely/shared-types";
import {
  createDiscoveryRun,
  approveDiscoveryRun,
  DiscoveryRunStateError,
  DiscoveryRunNotFoundError,
  DiscoveryRunValidationError,
} from "../services/discovery.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";
import { recordUsageOrReject } from "../lib/route-usage.js";

function toSummary(run: {
  id: string;
  workspaceId: string;
  createdById: string;
  comparableCompanies: string[];
  status: string;
  previewResults: unknown;
  resultSearchId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    createdById: run.createdById,
    comparableCompanies: run.comparableCompanies,
    status: run.status,
    previewResults: (run.previewResults as DiscoveryPreview | null) ?? null,
    resultSearchId: run.resultSearchId,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

const discoveryRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        summary:
          "Start a lookalike discovery run: finds investors in comparable companies' cap tables and expands via the co-investment graph, in a background job. Status changes emit a webhook + in-app notification.",
        body: createDiscoveryRunBodySchema,
        response: { 202: discoveryRunSummarySchema },
      },
    },
    async (request, reply) => {
      const db = await scopedPrismaOrReject(fastify.prisma, request.body.workspaceId, request.body.createdById, reply);
      if (!db) return;

      const allowed = await recordUsageOrReject(
        db,
        { workspaceId: request.body.workspaceId, userId: request.body.createdById, type: "DISCOVERY_RUN" },
        reply
      );
      if (!allowed) return;

      const run = await createDiscoveryRun(db, request.body);
      reply.code(202);
      return toSummary(run);
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        summary: "List discovery runs for a workspace",
        querystring: listDiscoveryRunsQuerySchema,
        response: { 200: z.array(discoveryRunSummarySchema) },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const runs = await db.discoveryRun.findMany({ orderBy: { createdAt: "desc" } });
      return runs.map(toSummary);
    }
  );

  fastify.get(
    "/:id",
    {
      schema: {
        summary: "Get a discovery run's status and preview results (poll-safe compatibility endpoint)",
        params: discoveryRunIdParamsSchema,
        querystring: workspaceAuthQuerySchema,
        response: { 200: discoveryRunSummarySchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const run = await db.discoveryRun.findUnique({ where: { id: request.params.id } });
      if (!run) return reply.notFound();
      return toSummary(run);
    }
  );

  fastify.post(
    "/:id/approve",
    {
      schema: {
        summary:
          "Approve a subset of a discovery run's candidates. Triggers enrichment of the approved firms and merges them into a new Search, in a background job.",
        params: discoveryRunIdParamsSchema,
        body: approveDiscoveryRunBodySchema,
        response: { 202: discoveryRunSummarySchema },
      },
    },
    async (request, reply) => {
      const db = await scopedPrismaOrReject(fastify.prisma, request.body.workspaceId, request.body.userId, reply);
      if (!db) return;

      try {
        const run = await approveDiscoveryRun(db, request.params.id, request.body);
        reply.code(202);
        return toSummary(run);
      } catch (err) {
        if (err instanceof DiscoveryRunNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof DiscoveryRunValidationError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof DiscoveryRunStateError) {
          return reply.conflict(err.message);
        }
        throw err;
      }
    }
  );
};

export default discoveryRoutes;
