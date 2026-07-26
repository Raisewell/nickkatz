import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { optOutBodySchema, optOutResponseSchema } from "../schemas/suppression.js";
import { recordSuppression, InvalidSuppressionRequestError } from "../services/suppression.js";

const ACKNOWLEDGEMENT =
  "Your request has been recorded. Any matching data we hold will be removed, and this identifier will be excluded from future imports.";

const suppressionRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/opt-out",
    {
      // Public and unauthenticated by design (right to erasure shouldn't
      // require an account) - rate-limited hard since it's the one endpoint
      // in the API anyone on the internet can call with no auth at all.
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
      schema: {
        summary:
          "GDPR/CCPA right-to-erasure: suppress an email or LinkedIn URL from all current and future Raisely data. Public, no account required.",
        body: optOutBodySchema,
        response: { 200: optOutResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        await recordSuppression(fastify.prisma, {
          email: request.body.email,
          linkedinUrl: request.body.linkedinUrl,
          requestIp: request.ip,
        });
      } catch (err) {
        if (err instanceof InvalidSuppressionRequestError) {
          return reply.badRequest(err.message);
        }
        throw err;
      }

      // Always the same response regardless of whether anything actually
      // matched - confirming a hit/miss would turn this into an oracle for
      // enumerating who is or isn't in the system.
      return { status: "acknowledged" as const, message: ACKNOWLEDGEMENT };
    }
  );
};

export default suppressionRoutes;
