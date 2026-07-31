import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  deleteResponseSchema,
  exportResponseSchema,
  workspaceIdParamsSchema,
} from "../schemas/workspace-data.js";
import {
  createWorkspaceBodySchema,
  workspaceSummarySchema,
} from "../schemas/workspaces.js";
import { deleteWorkspace, exportWorkspaceData } from "../services/workspace-data.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

const workspaceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary: "List workspaces the caller owns or is a member of - drives the workspace switcher",
        response: { 200: z.array(workspaceSummarySchema) },
      },
    },
    async (request) => {
      const workspaces = await fastify.prisma.workspace.findMany({
        where: { OR: [{ ownerId: request.user.id }, { members: { some: { userId: request.user.id } } }] },
        orderBy: { createdAt: "asc" },
      });
      return workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        ownerId: w.ownerId,
        plan: w.plan,
        companyOneLiner: w.companyOneLiner,
      }));
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        summary:
          "Create a workspace owned by the caller. Used for onboarding a brand-new sign-up who has none yet, " +
          "and for advisors adding another workspace beyond their first.",
        body: createWorkspaceBodySchema,
        response: { 201: workspaceSummarySchema },
      },
    },
    async (request, reply) => {
      const base = slugify(request.body.name ?? request.user.email ?? "workspace");
      const workspace = await fastify.prisma.workspace.create({
        data: {
          name: request.body.name ?? `${(request.user.email ?? "New").split("@")[0]}'s workspace`,
          slug: `${base}-${Date.now().toString(36)}`,
          ownerId: request.user.id,
          companyOneLiner: request.body.companyOneLiner,
        },
      });
      reply.code(201);
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
        plan: workspace.plan,
        companyOneLiner: workspace.companyOneLiner,
      };
    }
  );

  fastify.post(
    "/:id/export",
    {
      schema: {
        summary: "GDPR/CCPA data portability: export everything this workspace owns (excludes webhook secrets)",
        params: workspaceIdParamsSchema,
        response: { 200: exportResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const db = await scopedPrismaOrReject(fastify.prisma, id, request.user.id, reply);
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
        response: { 200: deleteResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const db = await scopedPrismaOrReject(fastify.prisma, id, request.user.id, reply);
      if (!db) return;

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
      if (workspace.ownerId !== request.user.id) {
        return reply.forbidden("Only the workspace owner can delete this workspace");
      }

      await deleteWorkspace(fastify.prisma, id);
      return { status: "deleted" as const, workspaceId: id };
    }
  );
};

export default workspaceRoutes;
