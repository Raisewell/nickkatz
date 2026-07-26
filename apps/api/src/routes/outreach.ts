import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  outreachDestinationSchema,
  exportOutreachBodySchema,
  sendOutreachBodySchema,
  outreachSendResultSchema,
} from "../schemas/outreach.js";
import { buildOutreachRecipients } from "../services/outreach.js";
import { buildOutreachCsv } from "../services/outreach-destinations/csv.js";
import { getOutreachDestination, OutreachDestinationNotImplementedError } from "../services/outreach-destinations/registry.js";
import { OUTREACH_DESTINATIONS } from "../services/outreach-destinations/registry.js";
import { scopedPrismaOrReject } from "../lib/route-workspace-auth.js";
import { recordUsageOrReject } from "../lib/route-usage.js";

const outreachRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/destinations",
    {
      schema: {
        summary: "List outreach destinations and whether each is actually implemented yet",
        response: { 200: z.array(outreachDestinationSchema) },
      },
    },
    async () => {
      return OUTREACH_DESTINATIONS.map((d) => ({ key: d.key, name: d.name, implemented: d.implemented }));
    }
  );

  fastify.post(
    "/export",
    {
      schema: {
        summary: "Export leads as a CSV file (always available, no external account needed)",
        body: exportOutreachBodySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId, leadIds } = request.body;
      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const recipients = await buildOutreachRecipients(db, leadIds);
      if (recipients.length !== leadIds.length) {
        return reply.notFound("One or more leadIds were not found in this workspace");
      }

      const allowed = await recordUsageOrReject(
        db,
        { workspaceId, userId, type: "EXPORT", costUnits: leadIds.length },
        reply
      );
      if (!allowed) return;

      const csv = buildOutreachCsv(recipients);
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="raisely-outreach-export.csv"');
      return reply.send(csv);
    }
  );

  fastify.post(
    "/send",
    {
      schema: {
        summary:
          "Send leads to an outreach destination (CSV always works; HeyReach is fully implemented; others are typed stubs pending integration)",
        body: sendOutreachBodySchema,
        response: { 200: outreachSendResultSchema },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId, leadIds } = request.body;
      const destination = getOutreachDestination(request.body.destination);
      if (!destination) {
        return reply.badRequest(`Unknown outreach destination: ${request.body.destination}`);
      }

      const db = await scopedPrismaOrReject(fastify.prisma, workspaceId, userId, reply);
      if (!db) return;

      const recipients = await buildOutreachRecipients(db, leadIds);
      if (recipients.length !== leadIds.length) {
        return reply.notFound("One or more leadIds were not found in this workspace");
      }

      const allowed = await recordUsageOrReject(
        db,
        { workspaceId, userId, type: "EXPORT", costUnits: leadIds.length },
        reply
      );
      if (!allowed) return;

      try {
        const result = await destination.send(recipients, request.body.config);
        return { destination: result.destination, succeeded: result.succeeded, failed: result.failed, details: result.details };
      } catch (err) {
        if (err instanceof OutreachDestinationNotImplementedError) {
          return reply.notImplemented(err.message);
        }
        throw err;
      }
    }
  );
};

export default outreachRoutes;
