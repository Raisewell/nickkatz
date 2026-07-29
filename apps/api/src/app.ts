import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
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
import authRoutes from "./routes/auth.js";
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
import suppressionRoutes from "./routes/suppression.js";
import usageRoutes from "./routes/usage.js";
import billingRoutes from "./routes/billing.js";
import stripeWebhookRoutes from "./routes/webhooks-stripe.js";
import workspaceRoutes from "./routes/workspaces.js";

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
  // global: false - only routes that opt in via `config: { rateLimit }`
  // (currently just the public, unauthenticated /opt-out endpoint) are
  // limited; authenticated routes aren't rate-limited at this layer.
  app.register(rateLimit, { global: false });

  app.register(swagger, {
    openapi: {
      info: { title: "Raisely API", version: "0.1.0" },
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.register(prismaPlugin);
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/auth" });
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
  app.register(suppressionRoutes);
  app.register(usageRoutes, { prefix: "/usage" });
  app.register(billingRoutes, { prefix: "/billing" });
  app.register(stripeWebhookRoutes);
  app.register(workspaceRoutes, { prefix: "/workspaces" });

  return app;
}
