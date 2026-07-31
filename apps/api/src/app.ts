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
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import workspaceRoutes from "./routes/workspaces.js";
import searchRoutes from "./routes/searches.js";
import exclusionListRoutes from "./routes/exclusion-lists.js";
import discoveryRoutes from "./routes/discovery.js";
import notificationRoutes from "./routes/notifications.js";
import webhookEndpointRoutes from "./routes/webhook-endpoints.js";
import networkContactRoutes from "./routes/network-contacts.js";
import warmPathRoutes from "./routes/warm-paths.js";
import leadRoutes from "./routes/leads.js";
import outreachDraftRoutes from "./routes/outreach-drafts.js";
import outreachRoutes from "./routes/outreach.js";
import roundPlanRoutes from "./routes/round-plan.js";
import billingRoutes from "./routes/billing.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";

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

  app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] });
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
  app.register(authPlugin);
  app.register(healthRoutes);
  app.register(workspaceRoutes, { prefix: "/workspaces" });
  app.register(searchRoutes, { prefix: "/searches" });
  app.register(exclusionListRoutes, { prefix: "/exclusion-lists" });
  app.register(discoveryRoutes, { prefix: "/discovery" });
  app.register(notificationRoutes, { prefix: "/notifications" });
  app.register(webhookEndpointRoutes, { prefix: "/webhook-endpoints" });
  app.register(networkContactRoutes, { prefix: "/network-contacts" });
  app.register(warmPathRoutes, { prefix: "/warm-paths" });
  app.register(leadRoutes, { prefix: "/leads" });
  app.register(outreachDraftRoutes, { prefix: "/outreach-drafts" });
  app.register(outreachRoutes, { prefix: "/outreach" });
  app.register(roundPlanRoutes, { prefix: "/round-plan" });
  app.register(billingRoutes, { prefix: "/billing" });
  app.register(stripeWebhookRoutes, { prefix: "/webhooks/stripe" });

  return app;
}
