import type { FastifyInstance } from "fastify";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/health/db", async (_req, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (err) {
      fastify.log.error(err, "database health check failed");
      return reply.status(503).send({ status: "error" });
    }
  });
}
