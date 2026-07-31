import type { FastifyInstance } from "fastify";
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
import { assertLeadsAccessible } from "../lib/authz.js";
import { assertUnderUsageLimit, recordUsageEvent, UsageLimitExceededError } from "../services/usage.js";
import type { UsageEventType } from "@raisely/shared-types";

/** leadIds can span more than one workspace (e.g. an advisor exporting
 * across portco workspaces) - meter and gate each workspace touched, not
 * just the first one. */
async function chargeUsageForLeads(
  fastify: FastifyInstance,
  leadIds: string[],
  userId: string,
  type: UsageEventType
): Promise<{ error: string } | null> {
  const leads = await fastify.prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
  });
  for (const { workspaceId } of leads) {
    try {
      await assertUnderUsageLimit(fastify.prisma, workspaceId);
    } catch (err) {
      if (err instanceof UsageLimitExceededError) return { error: err.message };
      throw err;
    }
  }
  for (const { workspaceId } of leads) {
    await recordUsageEvent(fastify.prisma, { workspaceId, userId, type });
  }
  return null;
}

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
      await assertLeadsAccessible(fastify, request, request.body.leadIds);
      const limitError = await chargeUsageForLeads(fastify, request.body.leadIds, request.user.id, "EXPORT");
      if (limitError) return reply.paymentRequired(limitError.error);

      const recipients = await buildOutreachRecipients(fastify.prisma, request.body.leadIds);
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
      const destination = getOutreachDestination(request.body.destination);
      if (!destination) {
        return reply.badRequest(`Unknown outreach destination: ${request.body.destination}`);
      }

      await assertLeadsAccessible(fastify, request, request.body.leadIds);
      const limitError = await chargeUsageForLeads(fastify, request.body.leadIds, request.user.id, "EXPORT");
      if (limitError) return reply.paymentRequired(limitError.error);

      const recipients = await buildOutreachRecipients(fastify.prisma, request.body.leadIds);

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
