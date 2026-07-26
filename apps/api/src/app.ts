import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import prismaPlugin from "./plugins/prisma.js";
import healthRoutes from "./routes/health.js";
import searchRoutes from "./routes/searches.js";
import exclusionListRoutes from "./routes/exclusion-lists.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });
  app.register(sensible);
  app.register(multipart);

  app.register(swagger, {
    openapi: {
      info: { title: "Raisely API", version: "0.1.0" },
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.register(prismaPlugin);
  app.register(healthRoutes);
  app.register(searchRoutes, { prefix: "/searches" });
  app.register(exclusionListRoutes, { prefix: "/exclusion-lists" });

  return app;
}
