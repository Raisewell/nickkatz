import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";

declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; email?: string };
  }
}

// Routes that don't require a bearer token: uptime checks and the OpenAPI
// docs UI. Everything else needs a valid token minted by the web app's
// /api/token route (see apps/web/src/app/api/token/route.ts) from the
// signed-in user's session - the two apps never share NextAuth's own
// cookie/session format, only this HS256 secret.
const PUBLIC_PATH_PREFIXES = ["/health", "/docs"];

export default fp(async function authPlugin(fastify: FastifyInstance) {
  const secretValue = process.env.AUTH_SECRET;
  if (!secretValue) {
    throw new Error("AUTH_SECRET must be set for the API to verify session tokens");
  }
  const secret = new TextEncoder().encode(secretValue);

  fastify.addHook("onRequest", async (request, reply) => {
    if (PUBLIC_PATH_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.unauthorized("Missing bearer token");
    }

    try {
      const { payload } = await jwtVerify(header.slice("Bearer ".length), secret);
      if (!payload.sub) return reply.unauthorized("Token missing subject");
      request.user = { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
    } catch {
      return reply.unauthorized("Invalid or expired token");
    }
  });
});
