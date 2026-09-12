import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  deleteResponseSchema,
  exportResponseSchema,
  workspaceIdParamsSchema,
} from "../schemas/workspace-data.js";
import {
  addMemberBodySchema,
  createWorkspaceBodySchema,
  memberParamsSchema,
  workspaceMemberSchema,
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
          // Matches seed.ts's convention: the owner also gets an explicit
          // WorkspaceMember row (role OWNER), so `members` is always the
          // complete, single source of truth for "who can see this
          // workspace" - GET /:id/members relies on that.
          members: { create: [{ userId: request.user.id, role: "OWNER" }] },
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

  fastify.get(
    "/:id/members",
    {
      schema: {
        summary: "List the workspace's owner and members - drives a team-management settings page",
        params: workspaceIdParamsSchema,
        response: { 200: z.array(workspaceMemberSchema) },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const db = await scopedPrismaOrReject(fastify.prisma, id, request.user.id, reply);
      if (!db) return;

      const workspace = await fastify.prisma.workspace.findUniqueOrThrow({
        where: { id },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          members: { include: { user: { select: { id: true, email: true, name: true } } } },
        },
      });

      // Some workspaces (e.g. seeded ones) also carry an explicit OWNER-role
      // WorkspaceMember row for their owner; others (older ones created
      // before that became the convention) don't. Filter it out of
      // `members` either way rather than relying on which path created the
      // workspace, so the owner is never listed twice.
      const nonOwnerMembers = workspace.members.filter((m) => m.user.id !== workspace.owner.id);

      return [
        { userId: workspace.owner.id, email: workspace.owner.email, name: workspace.owner.name, role: "OWNER" as const },
        ...nonOwnerMembers.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
        })),
      ];
    }
  );

  fastify.post(
    "/:id/members",
    {
      schema: {
        summary:
          "Add an existing Raisely user to this workspace by email. Owner-only. The invitee must already have an " +
          "account (there's no email-invite flow yet) - they can create one with a single sign-in.",
        params: workspaceIdParamsSchema,
        body: addMemberBodySchema,
        response: { 201: workspaceMemberSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const workspace = await fastify.prisma.workspace.findUnique({ where: { id }, select: { ownerId: true } });
      if (!workspace) return reply.notFound(`Workspace ${id} not found`);
      if (workspace.ownerId !== request.user.id) {
        return reply.forbidden("Only the workspace owner can add members");
      }

      const user = await fastify.prisma.user.findUnique({ where: { email: request.body.email } });
      if (!user) {
        return reply.notFound("No Raisely account found for that email - ask them to sign in once first");
      }
      if (user.id === workspace.ownerId) {
        return reply.badRequest("That user already owns this workspace");
      }

      const existing = await fastify.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
      });
      if (existing) return reply.badRequest("That user is already a member of this workspace");

      const member = await fastify.prisma.workspaceMember.create({
        data: { workspaceId: id, userId: user.id, role: request.body.role },
      });

      reply.code(201);
      return { userId: user.id, email: user.email, name: user.name, role: member.role };
    }
  );

  fastify.delete(
    "/:id/members/:userId",
    {
      schema: {
        summary: "Remove a member from the workspace. Owner-only; the owner themselves can't be removed this way.",
        params: memberParamsSchema,
        response: { 204: z.void() },
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params;
      const workspace = await fastify.prisma.workspace.findUnique({ where: { id }, select: { ownerId: true } });
      if (!workspace) return reply.notFound(`Workspace ${id} not found`);
      if (workspace.ownerId !== request.user.id) {
        return reply.forbidden("Only the workspace owner can remove members");
      }
      if (userId === workspace.ownerId) {
        return reply.badRequest("The workspace owner can't be removed - transfer or delete the workspace instead");
      }

      const deleted = await fastify.prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId } });
      if (deleted.count === 0) return reply.notFound("That user is not a member of this workspace");

      reply.code(204);
    }
  );
};

export default workspaceRoutes;
