import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { importNetworkContactsQuerySchema, networkContactImportResponseSchema } from "../schemas/warm-paths.js";
import { importNetworkContactsCsv } from "../services/network-contacts.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";

const networkContactRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/import",
    {
      schema: {
        summary:
          "Import the founder's own connections (LinkedIn Connections.csv or a generic CSV) to compute warm paths from",
        querystring: importNetworkContactsQuerySchema,
        response: { 200: networkContactImportResponseSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const file = await request.file();
      if (!file) return reply.badRequest("Expected a multipart file upload");

      const raw = (await file.toBuffer()).toString("utf-8");
      return importNetworkContactsCsv(db, workspaceId, raw);
    }
  );
};

export default networkContactRoutes;
