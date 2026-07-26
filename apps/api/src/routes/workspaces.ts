import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { workspaceSchema } from "../schemas/workspaces.js";

const workspaceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        summary:
          "List workspaces with their owner and members. No auth yet, so this powers the workspace switcher until Auth.js is wired up.",
        response: { 200: z.array(workspaceSchema) },
      },
    },
    async () => {
      const workspaces = await fastify.prisma.workspace.findMany({
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
