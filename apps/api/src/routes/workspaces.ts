import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { workspaceSchema } from "../schemas/workspaces.js";

const workspaceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary:
          "List workspaces the caller owns or is a member of, with owner and member details. Powers the workspace switcher.",
        response: { 200: z.array(workspaceSchema) },
      },
    },
    async (request) => {
      const workspaces = await fastify.prisma.workspace.findMany({
        where: { OR: [{ ownerId: request.user.id }, { members: { some: { userId: request.user.id } } }] },
        orderBy: { createdAt: "asc" },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      });

      return workspaces.map((w) => {
        const members = [
          { id: `owner:${w.owner.id}`, role: "OWNER", user: w.owner },
          ...w.members
            .filter((m) => m.userId !== w.ownerId)
            .map((m) => ({ id: m.id, role: m.role, user: m.user })),
        ];
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.plan,
          usageLimit: w.usageLimit,
          companyOneLiner: w.companyOneLiner,
          ownerId: w.ownerId,
          members,
        };
      });
    }
  );
};

export default workspaceRoutes;
