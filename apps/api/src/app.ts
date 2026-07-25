import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import prismaPlugin from "./plugins/prisma.js";
import healthRoutes from "./routes/health.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  app.register(cors, { origin: true });
  app.register(sensible);
  app.register(prismaPlugin);
  app.register(healthRoutes);

  return app;
}
