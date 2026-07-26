import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { roundPlanBodySchema, roundPlanResponseSchema } from "../schemas/round-plan.js";
import { suggestTargetListSize, UnknownRoundPlanStageError, ROUND_PLAN_STAGES } from "../services/round-planning.js";

const roundPlanRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        summary: `Suggest a target investor-list size for a round, by stage (${ROUND_PLAN_STAGES.join(", ")}) and round size - a rule-of-thumb starting point, not a scientific model`,
        body: roundPlanBodySchema,
        response: { 200: roundPlanResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        return suggestTargetListSize(request.body);
      } catch (err) {
        if (err instanceof UnknownRoundPlanStageError) {
          return reply.badRequest(err.message);
        }
        throw err;
      }
    }
  );
};

export default roundPlanRoutes;
