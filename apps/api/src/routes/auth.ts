import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { devSessionBodySchema, devSessionResponseSchema } from "../schemas/auth.js";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/dev-session",
    {
      schema: {
        summary:
          "DEV-MODE ONLY identity bootstrap: upserts a User by email and returns (or creates) their first Workspace. " +
          "There is no password, token, or session cookie - this exists only so the prototype UI has a workspaceId/userId " +
          "to pass through, matching the TODO(auth) pattern used by every other route pending real Auth.js wiring.",
        body: devSessionBodySchema,
        response: { 200: devSessionResponseSchema },
      },
    },
    async (request) => {
      const { email, name, workspaceName, companyOneLiner } = request.body;

      const user = await fastify.prisma.user.upsert({
        where: { email },
        update: name ? { name } : {},
        create: { email, name, role: "FOUNDER" },
      });

      let workspace = await fastify.prisma.workspace.findFirst({
        where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
        orderBy: { createdAt: "asc" },
      });

      if (!workspace) {
        const base = slugify(workspaceName ?? email.split("@")[0]);
        workspace = await fastify.prisma.workspace.create({
          data: {
            name: workspaceName ?? `${email.split("@")[0]}'s workspace`,
            slug: `${base}-${Date.now().toString(36)}`,
            ownerId: user.id,
            companyOneLiner,
          },
        });
      } else if (companyOneLiner && companyOneLiner !== workspace.companyOneLiner) {
        workspace = await fastify.prisma.workspace.update({
          where: { id: workspace.id },
          data: { companyOneLiner },
        });
      }

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        companyOneLiner: workspace.companyOneLiner,
      };
    }
  );
};

export default authRoutes;
